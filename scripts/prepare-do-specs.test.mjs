import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

const repoRoot = resolve(import.meta.dirname, '..');

/**
 * Спеки прогона живут во временном каталоге, а не в `.scratch/deploy`.
 *
 * Тот каталог — артефакт рантбука: файл оттуда идёт прямо в `doctl apps update`. Пока
 * тесты писали туда же, обычный `bun run test` перед релизом подменял боевую спеку
 * тестовой — с чужим GitHub-репозиторием и ключом подписи сессий из этого файла.
 */
const specOutputDir = mkdtempSync(resolve(tmpdir(), 'do-specs-'));
const backendSpecPath = resolve(specOutputDir, 'backend-app.yaml');

afterAll(() => {
  rmSync(specOutputDir, { recursive: true, force: true });
});

describe('prepare-do-specs', () => {
  test('does not touch the runbook artifact directory', () => {
    // Регресс на реальный случай: `bun run test` перед релизом переписывал
    // `.scratch/deploy/backend-app.yaml` тестовыми значениями, а именно этот файл
    // рантбук скармливает `doctl apps update`.
    const runbookSpec = resolve(repoRoot, '.scratch/deploy/backend-app.yaml');
    const before = statSync(runbookSpec, { throwIfNoEntry: false })?.mtimeMs ?? null;

    expect(runPrepareSpecs().status).toBe(0);
    expect(readFileSync(backendSpecPath, 'utf8')).toContain('between-bubbles-test-api');

    const after = statSync(runbookSpec, { throwIfNoEntry: false })?.mtimeMs ?? null;
    expect(after).toBe(before);
  });

  test('rejects placeholder and obviously weak production JWT secrets', () => {
    for (const jwtSecret of [
      'replace-with-at-least-32-random-characters',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ]) {
      const result = runPrepareSpecs({ JWT_SECRET: jwtSecret });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('JWT_SECRET');
    }
  });

  test('rejects the placeholder backend worker command', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'must point at a real long-running worker command',
    );
  });

  test('rejects component names that collide after normalization', () => {
    const serviceCollision = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_NAME: 'API',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker:notifications',
    });
    expect(serviceCollision.status).not.toBe(0);
    expect(`${serviceCollision.stdout}\n${serviceCollision.stderr}`).toContain(
      'component name "api" conflicts with API service',
    );

    const optionalCollision = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_NAME: 'maintenance',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker:notifications',
      DO_BACKEND_CRON_NAME: 'maintenance',
      DO_BACKEND_CRON_TASK: 'db:ping',
      DO_BACKEND_CRON_SCHEDULE: '0 3 * * *',
    });
    expect(optionalCollision.status).not.toBe(0);
    expect(`${optionalCollision.stdout}\n${optionalCollision.stderr}`).toContain(
      'component name "maintenance" conflicts with backend worker',
    );
  });

  test('rejects App Platform component names shorter than two characters', () => {
    const result = runPrepareSpecs({ DO_DB_COMPONENT_NAME: 'x' });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'DO_DB_COMPONENT_NAME must normalize to an App Platform component name with 2 to 32 characters',
    );
  });

  test('rejects invalid backend cron schedules before writing deploy specs', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_CRON_NAME: 'daily-maintenance',
      DO_BACKEND_CRON_TASK: 'db:ping',
      DO_BACKEND_CRON_SCHEDULE: '0 3 nope * *',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('day-of-month field');
  });

  test('rejects unsupported App Platform instance size slugs', () => {
    const result = runPrepareSpecs({
      DO_API_INSTANCE_SIZE_SLUG: 'expensive-surprise',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'DO_API_INSTANCE_SIZE_SLUG must be one of:',
    );
  });

  test('rejects deployment spec generation from a different checkout branch', () => {
    const result = runPrepareSpecs(
      {
        DO_GIT_BRANCH: 'codex-deploy-branch-mismatch-test',
      },
      { skipReleaseGitCheck: false },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Deployment branch mismatch');
  });

  test('generates explicit backend worker and cron job blocks', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_NAME: 'notifications',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker:notifications',
      DO_BACKEND_CRON_NAME: 'daily-maintenance',
      DO_BACKEND_CRON_TASK: 'db:ping',
      DO_BACKEND_CRON_SCHEDULE: '0 3 * * *',
      DO_BACKEND_CRON_TIME_ZONE: 'Europe/Moscow',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = readFileSync(backendSpecPath, 'utf8');
    expect(spec).toContain('workers:');
    expect(spec).toContain('  - name: notifications');
    expect(spec).toContain('run_command: "bun run start:worker:notifications"');
    expect(spec).toContain('kind: SCHEDULED');
    expect(spec).toContain('run_command: "bun run start:cron -- db:ping"');
    expect(spec).toContain('time_zone: "Europe/Moscow"');
    expect(spec).toContain(`    http_port: 8080
    instance_size_slug: apps-s-1vcpu-1gb
    instance_count: 1`);
    expect(spec).toContain(`      - key: TRUSTED_PROXY_CLIENT_IP_HEADER
        value: "do-connecting-ip"`);
    expect(spec).toContain('    version: "18"');
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('generates explicit backend API instance sizing overrides', () => {
    const result = runPrepareSpecs({
      DO_API_INSTANCE_SIZE_SLUG: 'apps-s-1vcpu-2gb',
      DO_API_INSTANCE_COUNT: '2',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = readFileSync(backendSpecPath, 'utf8');
    expect(spec).toContain(`    http_port: 8080
    instance_size_slug: apps-s-1vcpu-2gb
    instance_count: 2`);
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('adds explicitly configured browser origins to backend CORS', () => {
    const result = runPrepareSpecs({
      DO_ADDITIONAL_CORS_ORIGINS: 'https://website.example.com,https://admin.example.com',
    });

    expect(result.status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');
    expect(spec).toContain(
      'value: "https://webapp.example.com,https://website.example.com,https://admin.example.com"',
    );
  });

  test('rejects independent App Platform default domains for production browser auth', () => {
    const result = runPrepareSpecs({
      DO_AUTH_SITE_DOMAIN: 'ondigitalocean.app',
      DO_BACKEND_URL: 'https://api-abc.ondigitalocean.app',
      DO_WEBAPP_URL: 'https://webapp-xyz.ondigitalocean.app',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'Independent *.ondigitalocean.app domains are not supported for browser auth',
    );
  });

  test('requires backend and webapp custom domains to share the declared auth site', () => {
    const result = runPrepareSpecs({
      DO_AUTH_SITE_DOMAIN: 'example.com',
      DO_BACKEND_URL: 'https://api.example.com',
      DO_WEBAPP_URL: 'https://webapp.other.example',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('DO_WEBAPP_URL hostname must belong to DO_AUTH_SITE_DOMAIN');
  });

  test('rejects ICANN and private public suffixes as the declared auth site', () => {
    for (const publicSuffix of ['co.uk', 'pages.dev']) {
      const result = runPrepareSpecs({
        DO_AUTH_SITE_DOMAIN: publicSuffix,
        DO_BACKEND_URL: `https://api.${publicSuffix}`,
        DO_WEBAPP_URL: `https://webapp.${publicSuffix}`,
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        'DO_AUTH_SITE_DOMAIN must be a registrable domain, not a public suffix',
      );
    }
  });

  test('rejects credentialed additional browser origins outside the declared auth site', () => {
    const result = runPrepareSpecs({
      DO_ADDITIONAL_CORS_ORIGINS: 'https://admin.other.example',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'DO_ADDITIONAL_CORS_ORIGINS hostname must belong to DO_AUTH_SITE_DOMAIN',
    );
  });

  test('writes secret-bearing backend specs with owner-only permissions', () => {
    const result = runPrepareSpecs();

    expect(result.status).toBe(0);
    expect(statSync(backendSpecPath).mode & 0o777).toBe(0o600);
  });

  test('rejects project slugs that overflow suffixed App Platform names', () => {
    const result = runPrepareSpecs({
      DO_PROJECT_SLUG: 'a-project-name-that-is-too-long',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('DO_PROJECT_SLUG');
  });

  test('rejects invalid plain-scalar deployment identifiers before writing YAML', () => {
    const invalidBranch = runPrepareSpecs({ DO_GIT_BRANCH: 'main\nservices: []' });
    expect(invalidBranch.status).not.toBe(0);
    expect(`${invalidBranch.stdout}\n${invalidBranch.stderr}`).toContain('DO_GIT_BRANCH');

    const invalidDatabase = runPrepareSpecs({ DO_DB_NAME: 'defaultdb\nenvs: []' });
    expect(invalidDatabase.status).not.toBe(0);
    expect(`${invalidDatabase.stdout}\n${invalidDatabase.stderr}`).toContain('DO_DB_NAME');
  });

  test('builds the website landing with a real link into the diary', () => {
    // Кнопка «Открыть дневник» — единственный вход в продукт с лендинга. Раньше тест
    // фиксировал отсутствие PUBLIC_WEBAPP_URL, то есть закреплял сборку на localhost.
    const missing = runPrepareSpecs({ DO_WEBAPP_URL: undefined }, { target: 'website' });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}\n${missing.stderr}`).toContain('DO_WEBAPP_URL');

    expect(runPrepareSpecs({}, { target: 'website' }).status).toBe(0);
    const spec = readFileSync(resolve(specOutputDir, 'website-static-app.yaml'), 'utf8');
    expect(spec).toContain('key: PUBLIC_WEBAPP_URL');
    expect(spec).toContain('value: "https://webapp.example.com"');
  });

  test('points the webapp at the website so the consent checkbox can open the documents', () => {
    // Галочка согласия записывает версию оферты (ТЗ §14), а сама оферта лежит на website.
    // Сборка дневника без его адреса означала бы согласие со ссылкой в никуда.
    const missing = runPrepareSpecs({ DO_WEBSITE_URL: undefined }, { target: 'webapp' });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}\n${missing.stderr}`).toContain('DO_WEBSITE_URL');

    const result = runPrepareSpecs(
      { DO_WEBSITE_URL: 'https://example.com' },
      { target: 'webapp' },
    );
    expect(result.status).toBe(0);

    const spec = readFileSync(resolve(specOutputDir, 'webapp-static-app.yaml'), 'utf8');
    expect(spec).toContain('key: VITE_WEBSITE_URL');
    expect(spec).toContain('value: "https://example.com"');
  });

  test('requires complete storage settings and marks credentials as secrets', () => {
    const incomplete = runPrepareSpecs({ SPACES_BUCKET: 'uploads' });
    expect(incomplete.status).not.toBe(0);
    expect(`${incomplete.stdout}\n${incomplete.stderr}`).toContain('SPACES_REGION');

    const complete = runPrepareSpecs({
      SPACES_REGION: 'nyc3',
      SPACES_BUCKET: 'uploads',
      SPACES_ENDPOINT: 'https://nyc3.digitaloceanspaces.com',
      SPACES_ACCESS_KEY_ID: 'access-key',
      SPACES_SECRET_ACCESS_KEY: 'secret-key',
    });
    expect(complete.status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');
    expect(spec).toContain('key: SPACES_ACCESS_KEY_ID');
    expect(spec).toContain('key: SPACES_SECRET_ACCESS_KEY');
    expect(spec.match(/type: SECRET/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('gives the backend its own public URLs so links and emails are not built on localhost', () => {
    expect(runPrepareSpecs().status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');

    // Публичные страницы записей открываются на самом бэкенде (ТЗ §12),
    // а ссылки из писем ведут в дневник (ТЗ §13).
    expect(spec).toContain('key: PUBLIC_BACKEND_URL');
    expect(spec).toContain('value: "https://api.example.com"');
    expect(spec).toContain('key: PUBLIC_WEBAPP_URL');
    expect(spec).toContain('value: "https://webapp.example.com"');
  });

  test('attaches the custom domain so browser auth does not depend on the default host', () => {
    expect(runPrepareSpecs().status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');

    expect(spec).toContain('domains:');
    expect(spec).toContain('- domain: "api.example.com"');
    expect(spec).toContain('type: PRIMARY');

    // На первом создании домена ещё нет: он появляется вместе с DNS.
    expect(runPrepareSpecs({}, { target: 'backend-initial' }).status).toBe(0);
    expect(readFileSync(backendSpecPath, 'utf8')).not.toContain('domains:');
  });

  test('always schedules the retention jobs the product promises', () => {
    expect(runPrepareSpecs().status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');

    // Без этих задач корзина копится вечно (ТЗ §7.6), а удалённые аккаунты не стираются
    // физически через 30 дней (ТЗ §14) — то есть обещание из политики не выполняется.
    for (const task of ['diary:trash:purge', 'accounts:purge', 'auth:sessions:cleanup']) {
      expect(spec).toContain(`bun run start:cron -- ${task}`);
    }
    // Плюс еженедельная копия базы (ТЗ §13): суточные снимки провайдера живут в том же
    // аккаунте и не спасают от его потери.
    expect(spec).toContain('bun run start:cron -- db:backup');
    expect(spec.match(/kind: SCHEDULED/g)?.length).toBe(4);
  });

  test('alerts on a restarting or starving API container', () => {
    expect(runPrepareSpecs().status).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');

    for (const rule of ['RESTART_COUNT', 'CPU_UTILIZATION', 'MEM_UTILIZATION']) {
      expect(spec).toContain(`rule: ${rule}`);
    }
  });

  test('requires both mail settings together and keeps the key a secret', () => {
    const halfConfigured = runPrepareSpecs({ RESEND_API_KEY: 're_test_key' });
    expect(halfConfigured.status).not.toBe(0);
    expect(`${halfConfigured.stdout}\n${halfConfigured.stderr}`).toContain('MAIL_FROM');

    expect(
      runPrepareSpecs({
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'Between Bubbles <noreply@example.com>',
      }).status,
    ).toBe(0);
    const spec = readFileSync(backendSpecPath, 'utf8');
    expect(spec).toContain('key: MAIL_FROM');
    expect(spec).toMatch(/key: RESEND_API_KEY[\s\S]{0,120}type: SECRET/);
  });

  test('adds the store directory administrators only when they are configured', () => {
    expect(runPrepareSpecs().status).toBe(0);
    expect(readFileSync(backendSpecPath, 'utf8')).not.toContain('ADMIN_EMAILS');

    expect(runPrepareSpecs({ ADMIN_EMAILS: 'owner@example.com' }).status).toBe(0);
    const withAdmins = readFileSync(backendSpecPath, 'utf8');
    expect(withAdmins).toContain('key: ADMIN_EMAILS');
    expect(withAdmins).toContain('owner@example.com');
  });
});

function runPrepareSpecs(extraEnv = {}, { skipReleaseGitCheck = true, target = 'backend-final' } = {}) {
  const testOnlyEnv = skipReleaseGitCheck
    ? {
        NODE_ENV: 'test',
        DO_SKIP_RELEASE_GIT_CHECK_FOR_TESTS: '1',
      }
    : {};

  return spawnSync(process.execPath, ['scripts/prepare-do-specs.mjs', target], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      ...testOnlyEnv,
      DO_SPEC_OUTPUT_DIR: specOutputDir,
      DO_PROJECT_SLUG: 'between-bubbles-test',
      DO_GITHUB_REPO: 'owner/repo',
      DO_GIT_BRANCH: 'main',
      JWT_SECRET: '0123456789abcdef'.repeat(4),
      DO_AUTH_SITE_DOMAIN: 'example.com',
      DO_BACKEND_URL: 'https://api.example.com',
      DO_WEBAPP_URL: 'https://webapp.example.com',
      ...extraEnv,
    },
  });
}
