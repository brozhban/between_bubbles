# Between Bubbles

Винный дневник для осознанного потребления. Мультипользовательское mobile-first
веб-приложение по [ТЗ v2](docs/DNEVINIK_TZ_v2.md) и [дизайн-системе](docs/DESIGN.md).

## Решения проекта

| Параметр | Значение |
|---|---|
| Слаг репозитория и пакетов | `between-bubbles`, `@between-bubbles/*` — легко переименовать, если бренд будет другим |
| Активные поверхности | `backend`, `webapp`, `website`, `packages/contracts` |
| Отложено | `mobile` (этап 3) |
| Локальная БД | Docker Compose, PostgreSQL 18 (нужен `uuidv7()`) |
| Деплой | DigitalOcean App Platform, регион `fra`. Домен `winesdiary.com` на Cloudflare |
| Почта | Resend, отправитель `noreply@winesdiary.com` |

## Что уже сделано

- **Данные.** Полная схема Prisma по ТЗ §4: пользователь с 18+ и согласием, недели, вина,
  записи, теги аромата, фото, общий справочник магазинов, публичные ссылки.
- **Контракты.** `packages/contracts` — словари домена (RU/EN), схемы записи, вина, недели,
  магазинов, профиля; возрастной барьер и версия оферты.
- **Метрики недели.** Все формулы ТЗ §8 чистыми функциями с юнит-тестами: бокалы, топовые
  вина со всеми лидерами при ничьей, мода по категории вкуса, распределения, траты по
  валютам без задвоения «той же бутылки».
- **API профиля.** `PATCH /api/profile` — язык, тема, таймзона, валюта и тумблер трат;
  DTO пользователя один и тот же, что у `/api/auth/me`.
- **Учётные данные.** Смена пароля и удаление аккаунта живут в `auth`, потому что обе
  операции обязаны отозвать все сессии. Удаление мягкое, полная очистка — фоновой
  задачей через 30 дней (ТЗ §14).
- **Восстановление пароля и подтверждение почты (ТЗ §13).** Одноразовые ссылки: сброс пароля
  живёт час, подтверждение — сутки, в БД лежит только хеш токена, повторный запрос гасит
  прежнюю ссылку. Сброс отзывает все сессии и заодно подтверждает адрес — переход по ссылке
  и есть доказательство владения им. Подтверждение почты **ничего не блокирует**: дневник
  работает сразу после регистрации, а в шапке висит закрываемое напоминание с кнопкой
  «прислать письмо». Ответ формы восстановления одинаков для любого адреса, чтобы она не
  работала проверкой «есть ли такой пользователь».
  Отправляет **Resend** по HTTP API — без пакета провайдера в зависимостях: ради одного
  запроса это лишняя зависимость, а смена провайдера и так сводится к замене адаптера.
  Без `RESEND_API_KEY` письма уходят в лог — рабочий режим локальной разработки.
- **Пароли (ТЗ §13).** Минимум 8 символов плюс проверка по списку утечек: сам список,
  вариации с приписанными цифрами («password2024»), повторы одного символа и клавиатурные
  ряды. Правило живёт в контрактах, поэтому одинаково работает в браузере и на сервере.
- **API дневника.** Модуль `backend/src/modules/diary`: неделя с автосозданием, CRUD записей,
  корзина с восстановлением, справочник вин, теги аромата, магазины с дедупликацией и
  антиспамом. Изоляция пользователей покрыта интеграционными тестами (ТЗ §2).
- **Cron.** Очистка корзины и аккаунтов через 30 дней, сидирование системных тегов аромата.
- **Клиент.** Дизайн-система из `DESIGN.md` (палитры, сериф/капс, 0px радиусы), компоненты
  рейтинга, шкал, чипов, underline-полей. Экраны: неделя, форма записи в четыре шага
  (она же редактирование, с выбором магазина и «Та же бутылка»), карточка записи,
  «Мои вина», карточка вина, корзина.
  Настройки профиля с мгновенным применением темы, смена пароля и удаление аккаунта.
  Регистрация с 18+ и согласием.
- **Диаграммы недели** (ТЗ §9): столбцы по дням с переключателем «Вина / Бокалы»,
  круговая по типам вина и полосы по категориям вкуса. Полосы вместо круговой для
  категорий — согласованное отступление от ТЗ §9: семь различимых при дальтонизме
  оттенков в этой палитре не набирается. Собраны на SVG/CSS без библиотеки.
  Палитра диаграмм — отдельный набор от акцентов тегов: цвета из `DESIGN.md` давали на
  песочном фоне контраст 1.04:1. Оба набора (светлый и тёмный) прогнаны валидатором
  палитр на светлоту, цветность, различимость при дальтонизме и контраст к поверхности.
- **Фото записей (ТЗ §11).** До двух снимков на запись — бутылка и этикетка. Браузер сжимает
  картинку до 1600 px и приводит к JPEG (в том числе HEIC с iPhone), сервер проверяет формат
  по сигнатуре файла, вырезает все метаданные вместе с GPS и кладёт в приватное хранилище
  версии 1600 px и 400 px. Наружу — только подписанные ссылки с TTL 5 минут. Фото добавляются
  и в форме новой записи, и в карточке уже сохранённой; миниатюра видна в списке недели,
  полный размер раскрывается по тапу. Локально Spaces не нужен: файлы пишутся в
  `MEDIA_LOCAL_DIR` и отдаются маршрутом `/media` с той же подписью и TTL.
  Обработка на `jimp`, а не на `sharp`: нативный биндинг `sharp` не грузится под Bun.
- **Выгрузка дневника (ТЗ §14).** CSV и JSON из настроек профиля. CSV читает человек:
  заголовки и значения словарей переведены на язык интерфейса, файл начинается с BOM, иначе
  Excel открывает кириллицу кракозябрами; заметки с запятыми и переносами экранируются по
  RFC 4180. JSON остаётся машинным — английские ключи и коды перечислений, чтобы смена языка
  в настройках не ломала формат. Выгружаются активные записи, корзина в файл не идёт.
  **Отступление от ТЗ:** файл собирается синхронно в ответе, а не фоновой задачей со ссылкой
  с TTL. Дневник на тысячу записей — сотни килобайт и миллисекунды; очередь с временным
  файлом добавила бы движущихся частей больше, чем пользы. Сериализатор переедет в фоновую
  задачу без изменений, если дневники дорастут до размеров, где ответ не помещается в запрос.
- **Справочник стран.** Полный ISO 3166-1 alpha-2 с флагами; названия строятся через
  `Intl.DisplayNames` под язык интерфейса, поэтому локализованной таблицы в репозитории нет.
- **i18n ru/en (ТЗ §13).** Каталог подписей в `webapp/src/platform/i18n`, язык берётся из
  профиля и применяется мгновенно, без перезагрузки. Названия стран и дней недели строит
  `Intl.DisplayNames`, доменные словари — из контрактов. Фильтр «Мои вина» по рейтингу
  доведён до конца (был только тип и сортировка).
- **PWA.** Манифест, иконки (обычная и maskable), theme-color под обе темы, установка на
  домашний экран. Офлайн-заглушка (ТЗ §13): service worker подменяет браузерную ошибку «нет
  интернета» страницей приложения в обеих темах. Ассеты и данные не кэшируются намеренно —
  полноценный офлайн-режим вне MVP, а кэш показывал бы вчерашние метрики как сегодняшние.
- **E2E (Playwright).** Оба сценария приёмки из ТЗ §13 — «регистрация → первая запись →
  метрики недели» и «повтор вина → та же бутылка → траты не задвоились», плюс возрастной
  барьер, вход с неверным паролем, полный путь фото (выбор в форме → миниатюра в неделе →
  полный размер → удаление), восстановление пароля, напоминание о неподтверждённой почте,
  статистика за период, скачивание выгрузки, публикация записи (ссылка открывается в
  отдельном браузерном контексте без сессии и умирает по отзыву) и админка справочника.
  Запуск: `bun run e2e:webapp`
  (перед первым разом `bun run --cwd webapp e2e:install`).
- **Сайт.** Лендинг с возрастным дисклеймером и каркасы правовых страниц.

## Продакшен

Развёрнут на DigitalOcean App Platform тремя приложениями из одного репозитория.

**Релизы идут из ветки `production`, разработка — в `main`.** Пуш в `production`
автоматически пересобирает и выкатывает всё три приложения, пуш в `main` — нет.
Выпуск релиза: `git checkout production && git merge main && git push`.

| Адрес | Приложение | Что это |
|---|---|---|
| `winesdiary.com` | `between-bubbles-website` | лендинг и правовые страницы, статика |
| `app.winesdiary.com` | `between-bubbles-webapp` | дневник, статика |
| `api.winesdiary.com` | `between-bubbles-api` | бэкенд, публичные страницы записей `/w/{slug}` |

Данные: Managed PostgreSQL 18 (`fra1`), фото в Spaces `between-bubbles-photos`. Миграции
применяются шагом перед запуском, руками ничего делать не нужно.

Фоновые задачи (расписание — в [scripts/prepare-do-specs.mjs](scripts/prepare-do-specs.mjs)):
ежедневно чистятся корзина, удалённые аккаунты и просроченные сессии, еженедельно снимается
логическая копия базы в то же объектное хранилище с хранением 30 дней (ТЗ §13). Копия лежит
отдельно от суточных снимков провайдера: те живут в той же учётной записи и не спасают от её
потери. Восстановление проверяется интеграционным тестом — он наполняет дневник, снимает
копию, вычищает базу и разворачивает обратно; вручную это делается так:

```bash
bun run --cwd backend start:cron db:backup
```

Уведомления: перезапуски контейнера и упёршиеся ресурсы — алертами App Platform, полная
недоступность и истечение сертификата — проверкой доступности `/health/ready` из двух
регионов. Про 5xx App Platform уведомлять не умеет, поэтому следим за их следствием.

DNS живёт в Cloudflare без прокси (серое облако). Если включать оранжевое, бэкенду нужно
сменить `TRUSTED_PROXY_CLIENT_IP_HEADER` на `cf-connecting-ip`, иначе лимит частоты запросов
посчитает всех пользователей одним клиентом.

Конфигурации приложений генерируются из `.do/*.yaml.example` в `.scratch/deploy`; значения
для генерации (домены, имена ресурсов, ключи) лежат в `.scratch/deploy.env` — эта папка
исключена из git. Порядок обновления: `bun run deploy:do:specs backend-final`, затем
`doctl apps update <id> --spec .scratch/deploy/backend-app.yaml`.

## Что осталось по этапу 1

- Юридические тексты оферты и политики от заказчика. Пока страницы пустые, показывать сервис
  людям нельзя: галочка согласия при регистрации ссылается на них и фиксирует версию.

## Этап 2

- **Выгрузка данных CSV/JSON — сделана** (см. выше): по ТЗ §15 это этап 2, но по §14 это
  правовое требование, а работа оказалась замкнутой в одном модуле.
- **Статистика за период — сделана** (ТЗ §10.9). Переключатель «этот месяц / этот год /
  всё время»; границы календарные и считаются в таймзоне пользователя, как и границы недель.
  Показывает вина, бокалы и мл, топ-5 вин по среднему рейтингу вина (при равенстве выше то,
  что пробовали чаще), динамику по неделям с переключателем «Вина / Бокалы», распределения
  по типу, категории вкуса, странам и сортам, траты по валютам при включённом тумблере.
  У бленда считается каждый сорт, поэтому доли по сортам берутся от числа упоминаний, а не
  записей — иначе сумма ушла бы за сто процентов. Диаграммы по типам и категориям — те же
  компоненты, что в неделе. Экран открывается ссылкой с недели: пятый пункт нижней навигации
  на 360 px превращает её в нечитаемую ленту.
- **Публичные ссылки на запись — сделаны** (ТЗ §12). Кнопка «Поделиться» на карточке записи
  создаёт `/w/{slug}` со slug из 16 символов (96 бит энтропии), тумблер «показывать моё имя»
  выключен по умолчанию, ссылка отзывается в один клик. В публикацию идут фото, вино и его
  атрибуты, оценка, категория вкуса, ощущение и заметки; цена, магазин, почта и другие записи
  не идут — состав задан типом в одном месте и закреплён тестами. Отозванная ссылка и
  несуществующая отвечают одинаково, запись из корзины публиковаться перестаёт, страница
  закрыта от индексации (`noindex, nofollow`) и несёт OG-теги для превью в мессенджерах.
  **Страницу отдаёт бэкенд, а не `website`** — отступление от ТЗ §3. Причина: ТЗ §12 сам
  требует `noindex`, то есть SEO этой странице не нужно, а нужен только серверный рендер ради
  превью. Ради него `website` пришлось бы переводить на SSR: новая зависимость-адаптер и
  отдельный рантайм-контейнер в счёте DigitalOcean вместо статики. Бэкенд уже умеет всё
  нужное, включая подписанные ссылки на фото. Цена решения — адрес ссылки живёт на домене
  API; при выборе домена под неё стоит завести отдельный поддомен.
  Фото на публичной странице отдаются подписанными ссылками с TTL 5 минут, а не отдельным
  прокси, как предполагает ТЗ §11: страница собирается на сервере при каждом открытии, так
  что ссылка всегда свежая, а скопированный адрес картинки умирает через пять минут — то есть
  строже, чем у прокси, который жил бы до отзыва.
- **Админка справочника магазинов — сделана** (ТЗ §5.2 п.3, §10.12). Список с поиском и
  фильтром по статусу, скрытие мусора и слияние дублей: записи и личные списки «мои
  магазины» переезжают на мастер, дубль остаётся строкой со статусом `MERGED` и ссылкой на
  него — старые карточки записей магазин не теряют. Скрытый магазин пропадает из подсказок,
  но остаётся в уже сохранённых записях.
  **Роль администратора — список почт в `ADMIN_EMAILS`**, а не колонка в базе: админов
  единицы, назначает их тот же человек, что выкатывает релиз, а убрать доступ можно правкой
  конфига без миграции и без осиротевших строк. Проверка живёт в одном месте, поэтому
  переезд роли в базу, когда админов станет много, будет локальным. Чужому запросу админка
  отвечает обычным 404, а не 403: существование раздела не раскрывается, как и чужие записи.

## Первый запуск

Нужны Bun 1.3.14 и Docker (подойдёт Docker Desktop или OrbStack).

```bash
bun install
docker compose up -d postgres
bun run --cwd backend prisma:migrate
bun run --cwd backend start:cron diary:aroma-tags:seed
bun run dev
```

`backend/.env` копируется из `backend/.env.example`; `JWT_SECRET` нужно заменить на
собственную случайную строку от 32 символов — в репозиторий он не попадает.

Проверки: `bun run architecture:check`, `bun run typecheck`, `bun run --cwd webapp lint`,
`bun run test`, `bun run e2e:webapp`. Интеграционные и E2E-тесты сами поднимают
отдельную тестовую базу в Docker и гасят её после прогона.

---

# Vibe Coding Template

<p align="center">
  <img src="docs/assets/vibe_tmpl_schema.png" alt="Vibe Coding Template architecture schema" width="100%">
</p>

A full-stack starter for web and backend products: one repository with a Bun/Hono backend, a React CSR browser client (`webapp`), an Astro SSG/SSR site (`website`), and shared API contracts. The runnable Expo mobile template lives on the `mobile` branch so the default branch stays focused on webapp, backend, website, infrastructure, and shared contracts.

## Agent Intake Checklist Before Installing

Before cloning or installing this template for an end user, the agent should ask a short product-focused intake in the user's language and record the answers during setup:

- Confirm whether this is a new project from the template or work on the template itself.
- Ask for the project name/slug and the user's own GitHub destination, if they already have one.
- Ask what product they want to build first and the first user journey that should work.
- Ask which surfaces are active now: `webapp`, `mobile`, `backend/API`, `website`, or full-stack. Mark the rest as deferred.
- Route each browser feature by SEO need, not by habit: public, search-indexable, or link-previewed pages (landing, content, marketplace catalog) belong in `website` (Astro SSG first; SSR/hybrid only for request-specific routes); behind-login app screens with no SEO belong in `webapp` (CSR). See "Choosing `webapp` vs `website`". The user usually will not know this distinction, so decide it for them and explain it in product terms.
- If `mobile` is active, clone or checkout the `mobile` branch before setup; that branch is the mobile-ready template line with payments, Expo Push, and mobile-specific release/setup foundation.
- Ask whether the first version needs accounts/auth, persistence, file uploads, images/media, payments, admin tools, or external integrations.
- Ask whether the product needs real-time collaboration, chat, presence, live notifications, or other WebSocket-style updates.
- If `mobile` is active, switch to the `mobile` branch before setup and ask whether Expo/EAS builds and Maestro E2E validation are needed now or can be left unconfigured until later.
- For files/images/media, ask whether assets are public or private, what users upload, expected max file size, allowed file types, whether thumbnails/optimized variants are needed, and when files should be deleted.
- Ask whether deployment is needed now. If yes, use DigitalOcean by default and ask for production domains/URLs and release targets, not for a cloud provider choice.
- For DigitalOcean deployment, verify App Platform GitHub integration first, then generate specs with `bun run deploy:do:specs`; never hand-substitute secrets or URLs into app specs.
- If the user explicitly asks for Yandex Cloud, follow [docs/YANDEX_CLOUD.md](docs/YANDEX_CLOUD.md) instead of improvising provider choices.
- If backend/API, full-stack, uploads, or database-backed validation is active, verify Docker Compose and the Docker daemon before local setup.

## Agent Repo Download Instructions

When installing this repository from a GitHub URL into a fresh Codex or agent session, treat setup as an onboarding task before feature work. This README is the source of truth for first-run setup because fresh installers may not read `AGENTS.md`.

Give the agent this initial prompt:

```text
Install this repository into the project. Before cloning from a GitHub URL, ask whether I plan to develop a mobile app now. If yes, clone the `mobile` branch with `git clone --branch mobile --single-branch <repo-url>` or checkout `mobile` immediately after cloning; that branch is the mobile-ready template line with Expo, payments, Expo Push, social auth, and mobile-specific release/setup foundation. If mobile is deferred, use the default branch; it intentionally contains only `mobile/README.md` as a pointer to the mobile template branch. First read README.md, CLAUDE.md if present, and relevant docs/*.md, including docs/LOCAL_DATABASE.md when backend/API or full-stack work is active, docs/STORAGE.md when uploads, files, images, or media are active, and docs/YANDEX_CLOUD.md only when I explicitly ask for Yandex Cloud. Before setup, ask me what project name/slug I want to use, what product I want to build first, which surfaces I need now (webapp, mobile, backend/API, website, or full-stack), whether the first version needs auth/persistence/uploads/media/integrations, whether it needs real-time chat/presence/live updates, and whether I need deployment now. If mobile is active, confirm the checkout is on the `mobile` branch before running mobile setup, then follow that branch's README for Expo/EAS, Maestro, IAP, push, and social auth setup. Prefer the monolithic backend in this repository; do not introduce microservices during setup. If real-time features later need horizontal scaling across multiple backend instances, use managed Redis-compatible Pub/Sub such as DigitalOcean Managed Valkey or Yandex Managed Service for Valkey to fan out events between WebSocket connections. If deployment is needed, use DigitalOcean App Platform, DigitalOcean Managed PostgreSQL, and DigitalOcean Spaces by default; ask me for production domains/URLs and release targets, but do not ask me to choose a cloud provider unless I explicitly request another provider. For DigitalOcean deployment, first verify that App Platform is connected to my GitHub account/organization and has access to the full monorepo branch, then generate concrete specs with `bun run deploy:do:specs` into `.scratch/deploy`; do not use manual `sed`, `perl`, or shell substitution for secrets, CORS origins, `VITE_API_URL`, or `PUBLIC_WEBAPP_URL`. If I explicitly request Yandex Cloud, use Yandex Serverless Containers, Yandex Managed Service for PostgreSQL, Yandex Object Storage, and Yandex Cloud CDN according to docs/YANDEX_CLOUD.md. If backend/API, full-stack, uploads, or any database-backed validation is active, verify Docker Compose with `docker compose version` and the Docker daemon with `docker info`; if Docker is missing or not running, explain how to install/start it for my OS before continuing. Treat this checkout as a new project by default, not as a pull request back to the template: detach the original template remote unless I explicitly say I am contributing to the template, and add my own GitHub remote only if I provide one or ask you to create/publish it. Rename package.json and other repository-specific identifiers to the chosen project name where applicable. After first-run setup is complete, delete the marked Bootstrap-Only Instructions blocks from AGENTS.md and CLAUDE.md. Use Docker Compose for local PostgreSQL on Windows, macOS, and Linux; do not require native PostgreSQL or cloud credentials for local development.
```

- First read `README.md`, `CLAUDE.md` if present, and relevant `docs/*.md`, then inspect package scripts and `.env.example` files before running setup commands.
- Inspect `git remote -v` before any branch, commit, push, or PR workflow. If `origin` points to the template repository and the user has not explicitly said they are contributing to the template, treat this as a new project and detach from the template remote with `git remote remove origin`.
- If the user provides their own GitHub repository URL or asks to publish the new project, add that URL as the new `origin` after the template remote is removed. If the user has not chosen a destination yet, leave the repository with no `origin` and report that publishing is not configured.
- Do not open pull requests against the template repository during first-run project setup. Ask only if the user explicitly says this checkout is for improving the template itself.
- Ask the user a short intake in the user's language before making product or deployment choices:
  - what project name/slug to use;
  - what product or app they want to build first;
  - which surfaces are active now: webapp, mobile, backend/API, website, or full-stack;
  - if mobile is active, whether the checkout is already on the `mobile` branch; if not, switch to `mobile` before setup;
  - whether the first version needs accounts/auth, persistence, uploads/files/images/media, payments, admin tools, or external integrations;
  - whether real-time chat, presence, collaboration, live notifications, or WebSocket-style updates are needed now;
  - whether Expo/EAS builds and Maestro E2E validation are needed now when mobile is active;
  - whether deployment is needed now, and if yes, the production domains/URLs and release targets.
- Rename the template deliberately rather than with an unreviewed global replacement. Use `rg -n "between_bubbles|between-bubbles"` to inventory package scopes, database names, cookie names, Docker/Compose isolation names, deploy image defaults, and architecture-check aliases; update each owning source, regenerate `bun.lock` with the repository's pinned Bun version, then run install, typecheck, architecture checks, backend integration, and web E2E for the active surfaces.
- After the user answers, record durable project choices in the relevant README sections before feature work: project name/slug, active surfaces, deferred surfaces, validation scope, and what deployment/release work is in or out of scope. Once setup is complete, remove the marked `Bootstrap-Only Instructions` blocks from `AGENTS.md` and `CLAUDE.md`.
- If only the webapp is active, keep mobile deferred on the default branch: do not run Expo/EAS/Maestro setup and do not add mobile features. When the user later asks for mobile, switch to the `mobile` branch first.
- If only the mobile app is active, keep webapp and website intact but deferred: do not add browser-only features or Playwright flows unless they support the active mobile/backend work, and add or update a short deferred-surface note in `webapp/README.md` or `website/README.md` as relevant. When the user later asks for webapp, remove or rewrite that note, then set up and validate webapp normally.
- On the `mobile` branch, keep template-level Expo/EAS config universal. Do not commit an `expo.owner` or `extra.eas.projectId` to the template. In an installed project, write `expo.owner` and run EAS project init only after the user selects the real Expo personal account or organization that should own the app.
- On the `mobile` branch, use an installed Expo development build for Maestro E2E, not Expo Go. Follow that branch's mobile README before running mobile flows.
- Prefer README-level deferred-surface notes over source-code comments. Add code comments only when a dormant code path would otherwise mislead future work.
- Default to local-only setup when the user does not need deployment yet. Local development must not require DigitalOcean credentials.
- Use [docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) and `docker-compose.yml` as the local PostgreSQL source of truth. The default local database path is Docker Compose, not a native PostgreSQL install.
- If deployment is requested, use DigitalOcean App Platform as the supported production path. Use DigitalOcean Managed PostgreSQL for production databases; do not use App Platform dev databases for production.
- For the default DigitalOcean production backend/API service, start with one `apps-s-1vcpu-1gb` App Platform container (`instance_count: 1`) plus the smallest DigitalOcean Managed PostgreSQL production cluster. This keeps the initial backend and database infrastructure around $27/month before taxes, traffic overages, storage, and optional add-ons. `webapp` and fully prerendered `website` output are Static Sites and do not need runtime container sizing. A `website` route with SSR/on-demand rendering or server islands needs a runtime service.
- Deploy `webapp` and fully prerendered `website` output as DigitalOcean App Platform Static Sites, not App Platform services. They do not get `instance_size_slug` or `instance_count`; static site assets are served through DigitalOcean's global CDN by default. Use an external CDN only when the product needs advanced controls such as bot filtering, custom rate limiting, or geographic traffic rules.
- For DigitalOcean app specs, use committed `.do/*.yaml.example` templates plus `bun run deploy:do:specs`; generated specs stay in `.scratch/deploy` and must fail on empty values or unresolved placeholders before `doctl apps create`. Concrete App Platform machine defaults live in `scripts/prepare-do-specs.mjs`; update that script and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) together when changing infrastructure tiers.
- Before deployment or cloud-resource updates, verify `git remote -v` and `git status --short --branch`. Deploy only from the intended pushed release branch with a clean worktree; if local changes, untracked files, or branch sync issues are present, stop instead of cleaning, stashing, resetting, or checking out over another session's work.
- Use DigitalOcean Spaces Standard Storage plus Spaces CDN for persistent files, uploads, and public media. Do not store uploads on the App Platform container filesystem.
- If the user explicitly chooses Yandex Cloud, use [docs/YANDEX_CLOUD.md](docs/YANDEX_CLOUD.md): Serverless Containers for backend/API, Managed Service for PostgreSQL for production data, Object Storage for files/static sites, and Cloud CDN for public static/media delivery.
- Explain manual prerequisites only for the active release path: DigitalOcean account, billing/project setup, `doctl auth init`, registry access when using DigitalOcean Container Registry, DigitalOcean Managed PostgreSQL, and production domains/DNS. Expo/EAS/App Store/Google Play setup lives on the `mobile` branch.
- The agent may create uncommitted local `.env` files from `.env.example` and generate a local-only `JWT_SECRET`; never commit secrets or print raw secrets in the final report.
- After setup, run the smallest meaningful validation for the chosen active surfaces and report local URLs, commands run, and anything the user still needs to authorize manually.

## What's Inside

- `backend` - Bun + Hono + Prisma + PostgreSQL, custom JWT auth, Zod validation, and OpenAPI output.
- `webapp` - React + Vite + TanStack Query/Form/Router CSR browser client with the baseline auth flow.
- `website` - a separate Astro project for public SSG/SSR pages (landing, content sites, marketplace).
- `mobile/README.md` - pointer to the runnable Expo mobile template on the `mobile` branch.
- `packages/contracts` - shared Zod schemas and TypeScript API types.
- `.do` - committed DigitalOcean App Platform spec templates; generate concrete specs into `.scratch/deploy` with `bun run deploy:do:specs`.
- `docker-compose.yml` - local PostgreSQL 18 through the official `postgres:18-alpine` image on port `54329`; test runners use a repository-derived port by default, or `POSTGRES_TEST_PORT` when set. PostgreSQL 18 is intentional because the backend schema uses strict database-generated UUIDv7 IDs.
- `docs/TESTING.md` - the backend and Playwright testing contract. Mobile Maestro guidance lives on the `mobile` branch.
- `docs/LOCAL_DATABASE.md` - cross-platform local PostgreSQL setup for Windows, macOS, and Linux.
- `docs/STORAGE.md` - DigitalOcean Spaces, CDN, uploads, and image/media storage rules.
- `docs/YANDEX_CLOUD.md` - optional Yandex Cloud deployment path when the user explicitly chooses it.

## Choosing `webapp` vs `website`

This template ships two browser surfaces. Putting a feature in the wrong one is the most common early mistake, so the installing agent must pick deliberately and explain the choice in product terms the user understands.

- Build it in **`website`** (Astro, static by default, SSR/hybrid only when needed) when pages must be **public and found by search engines or shared with rich link previews**: marketing/landing pages, content sites, blogs, docs, and the public storefront of a **marketplace**. For a marketplace, this usually means the landing page, category/search landing pages, public listing/product pages, SEO metadata, and rich previews.
- Build it in **`webapp`** (React, client-side rendered) when screens live **behind sign-in and do not need SEO**: login-adjacent app flows after redirect, buyer account, seller/admin panels, checkout/account workflows, dashboards, settings, and authenticated tools. No crawler needs these, so CSR is the simpler, cheaper choice.

Rule of thumb for the agent: *if a page must rank in search or preview nicely when shared, it belongs in `website`; if it is only reachable after login, it belongs in `webapp`.* Real marketplaces normally use **both**: the public catalog lives in `website`, the authenticated app lives in `webapp`, and both reuse the same `@between-bubbles/contracts` schemas. Do not rebuild SEO pages inside `webapp` to "keep everything in one app"; that loses the SEO the product needs. Do not move the full authenticated app into Astro just because the product has public SEO pages.

Astro stays the default website stack for this template because it is content-first, static-first, ships little JavaScript by default, and gives agents a clear SEO surface. Choose Next.js only when the project intentionally wants a Vercel-optimized ISR/cache platform as a core product requirement. Treat TanStack Start as an optional future React full-stack path for teams that want one React app with selective SSR; it is not the simple default for non-programmer vibe-coding projects.

## Quick Start

Install dependencies first:

```bash
bun install
```

If backend/API, full-stack, or other database-backed work is active, check Docker first. Docker is the local app that runs PostgreSQL for this template:

```bash
docker compose version
docker info
```

If either command fails, install and start Docker before continuing:

- Windows: install Docker Desktop, enable the WSL 2 backend, start Docker Desktop, then rerun `docker compose version` and `docker info`.
- macOS: install and start Docker Desktop, or another Docker Engine with Compose v2, then rerun `docker compose version` and `docker info`.
- Linux: install Docker Engine and the Docker Compose plugin, start the Docker service, then rerun `docker compose version` and `docker info`.

Do not switch new users to native PostgreSQL during local setup. The repository's documented local path is Docker Compose for backend/API work.

### Backend/API Or Full-Stack

Only run this block when backend/API, full-stack, or DB-backed validation is active.

```bash
docker compose pull postgres
docker compose up -d postgres
```

Create the backend env file:

```bash
# macOS, Linux, or Git Bash on Windows
cp backend/.env.example backend/.env
```

```powershell
# Windows PowerShell
Copy-Item backend/.env.example backend/.env
```

Then apply migrations:

```bash
bun run --cwd backend prisma:deploy
```

### Run The Active Surfaces

Start only the app surfaces you need in separate terminals:

```bash
bun run dev:backend
bun run dev:webapp
bun run dev:website
```

Website-only setups can skip backend/PostgreSQL. A webapp-only project can skip it only after replacing or removing the included auth golden path; the committed webapp's register/login/session journey intentionally requires the backend.

Create `webapp/.env` when the browser client should use a non-default API URL:

```bash
VITE_API_URL=http://localhost:3000
```

Test runners use the separate Docker Compose `postgres_test` service and the `TEST_DATABASE_URL` shape from `.env.example`/`backend/.env.example`. Webapp Playwright E2E starts `postgres_test`, applies migrations to `between_bubbles_test`, runs the browser flow, and tears down its test database volume by default.

## Workspace Commands

- `bun run dev` - start all workspace projects in parallel dev mode.
- `bun run dev:backend` - start the backend API.
- `bun run dev:webapp` - start the Vite CSR webapp.
- `bun run dev:website` - start the Astro website project.
- `bun run typecheck` - run TypeScript checks across workspaces.
- `bun run build` - run production build/typecheck/export scripts for workspaces that define them.
- `bun run test` - run contract, backend, and webapp unit/integration tests.
- `bun run test:contracts` - run shared Zod contract tests.
- `bun run test:backend` - run backend unit and integration tests.
- `bun run test:backend:integration` - run DB-backed auth tests through `postgres_test`.
- `bun run test:webapp` - run webapp client tests.
- `bun run deploy:do:specs` - safely generate concrete DigitalOcean specs under `.scratch/deploy`.
- `bun run e2e:webapp` - run the Playwright auth smoke test through backend + Vite.
- `bun run --cwd backend prisma:migrate` - create/apply a Prisma migration in development.
- `bun run --cwd backend prisma:deploy` - apply existing Prisma migrations on a server.

## Project READMEs

- [backend/README.md](backend/README.md) - API, auth, Prisma, and backend validation.
- [docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) - Docker Compose PostgreSQL setup and reset workflow.
- [docs/STORAGE.md](docs/STORAGE.md) - DigitalOcean Spaces, CDN, uploads, and image/media storage rules.
- [docs/YANDEX_CLOUD.md](docs/YANDEX_CLOUD.md) - optional Yandex Cloud deployment path when explicitly selected.
- [webapp/README.md](webapp/README.md) - CSR browser client setup, env, and Playwright smoke.
- [mobile/README.md](mobile/README.md) - pointer to the full mobile template branch.
- [website/README.md](website/README.md) - Astro website commands, hybrid rendering, and publishing model.
- [packages/contracts/README.md](packages/contracts/README.md) - shared schema and DTO rules.

## License

This project is licensed under the Apache License 2.0. If you distribute a fork, copy, or derivative work, keep both [LICENSE](LICENSE) and [NOTICE](NOTICE) with the attribution to Dima Sukharev, GitHub profile, and the original repository.

## Architecture Notes

API contracts live in `packages/contracts` and are imported by every active layer. The backend validates input with those Zod schemas, and the webapp client reuses the same schemas in TanStack Form and API calls. The `mobile` branch extends the same contract model for Expo.

The backend API flow is `route -> validation -> auth/session guard -> service -> Prisma -> DTO`. Routes stay thin, auth business logic lives in the feature service, and API, worker, and cron entrypoints share `src/runtime.ts` for env and Prisma setup.

Keep the default architecture monolithic. For DigitalOcean production, the backend/API default is one `apps-s-1vcpu-1gb` App Platform container so a new project starts inside the expected low-cost budget with Managed PostgreSQL while retaining a clear scale-up path. Add backend worker or scheduled-job components from the same Docker image only when a concrete background or periodic task exists; the deployment generator refuses to deploy the empty worker placeholder. For real-time features, a single backend instance can own its local WebSocket connections. If the backend is horizontally scaled and users connected to different instances must receive the same chat, presence, or live events, add a managed Redis-compatible Pub/Sub broker between instances, using DigitalOcean Managed Valkey on the default path or Yandex Managed Service for Valkey when Yandex Cloud is explicitly selected.

Ongoing engineering guidance lives in [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/TESTING.md](docs/TESTING.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). First-run download and product setup instructions live in this README.

## Current Upstream Documentation

For framework, API, deployment, or testing questions, consult the current upstream documentation linked here first. The repository docs describe this template's conventions; the linked docs are the authoritative source for tool behavior and provider-specific changes.

- Runtime and package manager: [Bun docs](https://bun.sh/docs)
- Backend framework: [Hono docs](https://hono.dev/docs)
- Database ORM: [Prisma docs](https://www.prisma.io/docs) and [PostgreSQL docs](https://www.postgresql.org/docs/)
- Validation and contracts: [Zod docs](https://zod.dev/)
- JWT library: [jose documentation](https://github.com/panva/jose)
- Web stack: [React docs](https://react.dev/reference/react), [Vite guide](https://vite.dev/guide/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [TanStack Form](https://tanstack.com/form/latest/docs/framework/react/quick-start), and [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- Testing: [Playwright docs](https://playwright.dev/docs/intro)
- Website: [Astro docs](https://docs.astro.build/en/getting-started/)
- Local infrastructure: [Docker Compose docs](https://docs.docker.com/compose/) and [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres)
- Deployment and storage: [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/), [DigitalOcean App specs](https://docs.digitalocean.com/products/app-platform/reference/app-spec/), [DigitalOcean Static Sites](https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/), [DigitalOcean Managed Databases in App Platform](https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/), [DigitalOcean Valkey](https://docs.digitalocean.com/products/databases/valkey/), [DigitalOcean Dockerfile builds](https://docs.digitalocean.com/products/app-platform/reference/dockerfile/), [DigitalOcean Bun buildpack](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/bun/), [doctl](https://docs.digitalocean.com/reference/doctl/), [doctl apps spec validate](https://docs.digitalocean.com/reference/doctl/reference/apps/spec/validate/), [DigitalOcean Container Registry](https://docs.digitalocean.com/products/container-registry/), [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/), [DigitalOcean Spaces CDN](https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/), and [external CDN in front of App Platform](https://docs.digitalocean.com/products/app-platform/how-to/configure-external-cdn/)
- Optional Yandex Cloud path: [Yandex Cloud CLI](https://yandex.cloud/en/docs/cli/quickstart), [Yandex Serverless Containers](https://yandex.cloud/en/docs/serverless-containers/), [Yandex Container Registry](https://yandex.cloud/en/docs/container-registry/quickstart), [Yandex Managed PostgreSQL](https://yandex.cloud/en/docs/managed-postgresql/), [Yandex Managed Service for Valkey](https://yandex.cloud/en/docs/managed-redis/), [Yandex Object Storage static hosting](https://yandex.cloud/en/docs/storage/operations/hosting/setup), [Yandex Object Storage AWS CLI](https://yandex.cloud/en/docs/storage/tools/aws-cli), [Yandex Cloud CDN](https://yandex.cloud/en/docs/cdn/concepts/), and [Yandex Cloud Marketplace Image Resizer](https://yandex.cloud/en/marketplace/products/yc/image-resizer)
