import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = resolve(import.meta.dirname, '..');

/**
 * Подменяем `bun` заглушкой в PATH: проверяем поведение обёртки, а не доступность реестра.
 */
function runAuditWithFakeBun(script) {
  const binDir = mkdtempSync(join(tmpdir(), 'audit-bin-'));
  const fakeBun = join(binDir, 'bun');
  writeFileSync(fakeBun, script);
  chmodSync(fakeBun, 0o755);

  return spawnSync(process.execPath, ['scripts/audit.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      HOME: process.env.HOME ?? '',
      AUDIT_RETRY_DELAY_MS: '0',
    },
  });
}

describe('audit wrapper', () => {
  test('падает, когда аудит нашёл уязвимости', () => {
    const result = runAuditWithFakeBun(
      '#!/bin/sh\necho "high: something is vulnerable"\nexit 1\n',
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('нашёл уязвимости');
  });

  test('пропускает проверку, когда реестр отвечает ошибкой', () => {
    const result = runAuditWithFakeBun(
      '#!/bin/sh\necho "error: audit request failed (status 503)" >&2\nexit 1\n',
    );

    // Сборку не валим: чужой сбой не должен блокировать выкладку, а находка всплывёт
    // на следующем прогоне.
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('проверка пропущена');
  });

  test('передаёт исключённые находки в bun audit', () => {
    // Заглушка падает, если исключение не дошло до аудита.
    const result = runAuditWithFakeBun(
      '#!/bin/sh\ncase "$*" in *--ignore=GHSA-vfj7-8cjw-p6xm*) exit 0;; esac\necho "high: braces"\nexit 1\n',
    );

    expect(result.status).toBe(0);
  });

  test('проходит молча, когда всё чисто', () => {
    const result = runAuditWithFakeBun('#!/bin/sh\necho "No vulnerabilities found"\nexit 0\n');

    expect(result.status).toBe(0);
  });
});
