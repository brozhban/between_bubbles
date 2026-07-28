import {
  aftertasteLabels,
  AGE_DISCLAIMER_EN,
  AGE_DISCLAIMER_RU,
  sugarLevelLabels,
  tasteCategoryLabels,
  wineTypeLabels,
  type Aftertaste,
  type Locale,
  type SugarLevel,
  type TasteCategory,
  type WineType,
} from '@between-bubbles/contracts'

/**
 * Публичная страница записи (ТЗ §12, §10.2).
 *
 * Состав данных задан здесь типом, а не собирается по месту: цена, магазин, почта и другие
 * записи в публикацию не попадают, и это должно быть видно одним взглядом на структуру.
 *
 * Страница собирается строкой на сервере, а не рисуется клиентом: превью в мессенджерах
 * читают OG-теги из ответа и JavaScript не выполняют. По этой же причине стили встроены —
 * внешний файл в превью всё равно не участвует, а лишний запрос ломал бы первый экран.
 */

export type SharedPhoto = {
  url: string
  thumbUrl: string
}

export type SharedEntry = {
  slug: string
  tastedOn: string
  wineName: string
  wineType: WineType
  producer: string | null
  region: string | null
  originCountryName: string | null
  grapes: readonly string[]
  vintage: number | null
  sugar: SugarLevel | null
  rating: number
  tasteCategory: TasteCategory | null
  aftertaste: Aftertaste | null
  notes: string | null
  photos: readonly SharedPhoto[]
  /** null, пока автор не включил показ имени — тумблер выключен по умолчанию (ТЗ §12). */
  authorName: string | null
  /** Язык автора: страницу читают его гости, а не носители языка браузера. */
  locale: Locale
}

export function renderSharedEntryPage(entry: SharedEntry, pageUrl: string): string {
  const isEnglish = entry.locale === 'en'
  const title = `${entry.wineName} — ${entry.rating.toFixed(1)}`
  const description = buildDescription(entry)
  const cover = entry.photos[0]

  return `<!doctype html>
<html lang="${entry.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<!-- Публичная, но не для поиска: ссылкой делятся с конкретными людьми (ТЗ §12). -->
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${escapeAttribute(description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttribute(title)}">
<meta property="og:description" content="${escapeAttribute(description)}">
<meta property="og:url" content="${escapeAttribute(pageUrl)}">
${cover ? `<meta property="og:image" content="${escapeAttribute(cover.url)}">` : ''}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#dacabf">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#062d32">
<style>${pageStyles}</style>
</head>
<body>
<main>
${cover ? `<img class="cover" src="${escapeAttribute(cover.url)}" alt="${escapeAttribute(entry.wineName)}">` : ''}
<div class="card">
  <p class="caps">${escapeHtml(wineTypeLabels[entry.wineType][entry.locale])}</p>
  <h1>${escapeHtml(entry.wineName)}</h1>
  <p class="meta">${escapeHtml(buildMetaLine(entry))}</p>
  <p class="rating">${entry.rating.toFixed(1)}</p>
  ${renderFacts(entry, isEnglish)}
  ${entry.notes ? `<p class="notes">${escapeHtml(entry.notes)}</p>` : ''}
  ${entry.authorName ? `<p class="caps author">${escapeHtml(entry.authorName)}</p>` : ''}
</div>
<p class="disclaimer">${escapeHtml(isEnglish ? AGE_DISCLAIMER_EN : AGE_DISCLAIMER_RU)}</p>
</main>
</body>
</html>`
}

/** Страница отозванной или несуществующей ссылки. Ровно 404: отозванная не отличима от чужой. */
export function renderMissingSharePage(locale: Locale): string {
  const isEnglish = locale === 'en'

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${isEnglish ? 'Link is not available' : 'Ссылка недоступна'}</title>
<meta name="robots" content="noindex, nofollow">
<style>${pageStyles}</style>
</head>
<body>
<main>
<div class="card">
  <h1>${isEnglish ? 'Link is not available' : 'Ссылка недоступна'}</h1>
  <p class="meta">${
    isEnglish
      ? 'The author revoked this link or it never existed.'
      : 'Автор отозвал эту ссылку или её никогда не было.'
  }</p>
</div>
</main>
</body>
</html>`
}

function buildMetaLine(entry: SharedEntry): string {
  const parts = [
    entry.producer,
    entry.originCountryName,
    entry.region,
    entry.vintage === null ? null : String(entry.vintage),
    entry.sugar ? sugarLevelLabels[entry.sugar][entry.locale] : null,
    entry.grapes.length > 0 ? entry.grapes.join(', ') : null,
  ].filter((part): part is string => part !== null && part !== '')

  return parts.join(' · ')
}

/** Категория вкуса и ощущение — то немногое из профиля, что попадает в публикацию (ТЗ §12). */
function renderFacts(entry: SharedEntry, isEnglish: boolean): string {
  const facts: Array<[string, string]> = []

  if (entry.tasteCategory) {
    facts.push([
      isEnglish ? 'Taste category' : 'Категория вкуса',
      `${entry.tasteCategory} — ${tasteCategoryLabels[entry.tasteCategory][entry.locale]}`,
    ])
  }
  if (entry.aftertaste) {
    facts.push([
      isEnglish ? 'Aftertaste' : 'Ощущение',
      aftertasteLabels[entry.aftertaste][entry.locale],
    ])
  }

  if (facts.length === 0) return ''

  return `<dl class="facts">${facts
    .map(
      ([label, value]) =>
        `<dt class="caps">${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join('')}</dl>`
}

function buildDescription(entry: SharedEntry): string {
  const parts = [
    wineTypeLabels[entry.wineType][entry.locale],
    entry.tasteCategory
      ? `${entry.tasteCategory} — ${tasteCategoryLabels[entry.tasteCategory][entry.locale]}`
      : null,
    entry.notes,
  ].filter((part): part is string => part !== null && part !== '')

  const description = parts.join(' · ')
  // Превью в мессенджерах всё равно обрежет длинный текст, но обрезать его посередине слова
  // лучше здесь, чем отдавать наружу простыню целиком.
  return description.length > 200 ? `${description.slice(0, 197)}…` : description
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** Палитра и типографика из DESIGN.md: страница должна читаться как часть дневника. */
const pageStyles = `
:root{--bg:#dacabf;--surface:#efe3dc;--text:#444242;--muted:#595552;--border:#938a83;--accent:#aa9e54}
@media (prefers-color-scheme:dark){:root{--bg:#062d32;--surface:#344b52;--text:#e9e9e2;--muted:#767676;--border:#344b52;--accent:#aa9e54}}
*{box-sizing:border-box}
body{margin:0;padding:0 0 32px;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
main{max-width:520px;margin:0 auto}
.cover{display:block;width:100%;height:auto;max-height:60vh;object-fit:cover}
.card{background:var(--surface);border:1px solid var(--border);border-top:0;padding:24px;display:grid;gap:12px}
h1{margin:0;font-family:Lora,Georgia,serif;font-weight:400;font-size:28px;line-height:1.2}
.caps{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.meta{margin:0;font-size:13px;color:var(--muted);line-height:1.5}
.rating{margin:0;justify-self:start;background:var(--accent);color:#2b2b2b;font-size:15px;font-weight:500;padding:4px 10px}
.facts{margin:0;display:grid;gap:4px}
.facts dd{margin:0;font-size:14px}
.notes{margin:0;font-family:Lora,Georgia,serif;font-size:16px;line-height:1.5;white-space:pre-wrap}
.author{margin-top:8px}
.disclaimer{margin:16px 24px 0;font-size:11px;line-height:1.5;color:var(--muted)}
`
