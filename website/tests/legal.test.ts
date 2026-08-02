import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { expect, test } from 'bun:test'

import {
	IS_DRAFT,
	OPERATOR,
	TERMS_DATE_LABEL,
	TERMS_VERSION,
	VENUE,
	field,
	hostOf,
	isDraft,
	type LegalVenue,
	type Operator,
} from '../src/legal'

/**
 * `IS_DRAFT` управляет `noindex` на всех шести правовых страницах. Пропущенное при обходе
 * поле означает незаполненный договор в поисковой выдаче — ошибка, которую по готовой
 * странице не видно, потому что выглядит она как обычный опубликованный документ.
 */
test('заполненные реквизиты снимают режим черновика', () => {
	expect(isDraft(OPERATOR, VENUE)).toBe(false)
	expect(IS_DRAFT).toBe(false)
})

test.each(['name', 'registration', 'address', 'email'] as const)(
	'пустой реквизит %s возвращает страницы в черновик',
	(key) => {
		expect(isDraft({ ...OPERATOR, [key]: '  ' } satisfies Operator, VENUE)).toBe(true)
	},
)

/**
 * Обе языковые версии считаются наравне: английская формулировка юрисдикции — это текст
 * английского договора, а не перевод справочного значения.
 */
test.each([
	['jurisdiction', 'ru'],
	['jurisdiction', 'en'],
	['disputeVenue', 'ru'],
	['disputeVenue', 'en'],
] as const)('пустая %s.%s возвращает страницы в черновик', (fact, locale) => {
	const venue = { ...VENUE, [fact]: { ...VENUE[fact], [locale]: '' } } satisfies LegalVenue

	expect(isDraft(OPERATOR, venue)).toBe(true)
})

test('незаполненный реквизит печатается как явный пропуск', () => {
	expect(field('', 'адрес оператора')).toBe('[адрес оператора]')
	expect(field('   ', 'адрес оператора')).toBe('[адрес оператора]')
	expect(field('304665609', 'идентификационный номер ИП')).toBe('304665609')
})

/**
 * Дату в шапке документа и версию, которую webapp записывает в согласие (ТЗ §14), печатает
 * один и тот же `CURRENT_TERMS_VERSION`: разъехавшись, они сослали бы согласие на редакцию,
 * которой пользователь не видел.
 */
test('версия документа — ISO-дата, из которой считается подпись «Редакция от»', () => {
	expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	expect(Number.isNaN(new Date(`${TERMS_VERSION}T00:00:00Z`).getTime())).toBe(false)
})

/**
 * Сам флаг проверен выше, но применяют его шесть страниц по отдельности, а забытый проп
 * ничем себя не выдаёт: незаполненный договор выглядит как опубликованный. Седьмая правовая
 * страница без `noindex` уехала бы в выдачу молча, поэтому связь проверяем по исходникам.
 */
test('каждая страница на реквизитах закрывается от индексации в режиме черновика', () => {
	const pages = legalPageSources()
	const unguarded = pages
		.filter(({ source }) => !source.includes('noindex={IS_DRAFT}'))
		.map(({ path }) => path)

	expect(pages.map(({ path }) => path).sort()).toEqual([
		'contacts.astro',
		'en/contacts.astro',
		'en/offer.astro',
		'en/privacy.astro',
		'offer.astro',
		'privacy.astro',
	])
	expect(unguarded).toEqual([])
})

/**
 * Хост из оферты — единственный факт документа, который может быть не пустым, а неверным:
 * пропуск виден по квадратным скобкам и плашке черновика, а опечатка в адресе выглядит как
 * обычный опубликованный договор, называющий чужой сервис.
 */
test('незаданный адрес даёт запасной хост, а сломанный роняет сборку', () => {
	expect(hostOf('PUBLIC_WEBAPP_URL', undefined, 'app.winesdiary.com')).toBe('app.winesdiary.com')
	expect(hostOf('PUBLIC_WEBAPP_URL', '   ', 'app.winesdiary.com')).toBe('app.winesdiary.com')
	expect(hostOf('PUBLIC_WEBAPP_URL', 'https://app.example.com/x', 'fallback')).toBe(
		'app.example.com',
	)
	expect(() => hostOf('PUBLIC_WEBAPP_URL', 'app.example.com', 'fallback')).toThrow(
		'PUBLIC_WEBAPP_URL',
	)
})

/**
 * Дальше проверяем собранный HTML, а не исходники: `alternatePath` пишется руками на каждой
 * странице, но адрес для `hreflang` из него строит `Page.astro` — дописывает слэш, чтобы
 * попасть ровно в canonical другой версии. Опечатка в пути или потерянная нормализация дают
 * непарный `hreflang` и битую ссылку в навигации, и ни то ни другое не видно на самой
 * странице. Grep по исходникам этого не поймал бы: он проверяет намерение, а не результат.
 */
const SITE = 'https://legal-test.example'
const routes = ['offer', 'privacy', 'contacts']

test.each(routes)('русская и английская версии /%s ссылаются друг на друга', (route) => {
	const ru = builtPage(`${route}/index.html`)
	const en = builtPage(`en/${route}/index.html`)

	expect(canonical(ru)).toBe(`${SITE}/${route}/`)
	expect(canonical(en)).toBe(`${SITE}/en/${route}/`)

	// Пара считается взаимно: каждая версия называет canonical-адрес соседней и свой собственный.
	expect(alternates(ru)).toEqual({ ru: `${SITE}/${route}/`, en: `${SITE}/en/${route}/` })
	expect(alternates(en)).toEqual({ ru: `${SITE}/${route}/`, en: `${SITE}/en/${route}/` })

	expect(langOf(ru)).toBe('ru')
	expect(langOf(en)).toBe('en')
})

/**
 * Двуязычные значения выбираются ключом руками, и перепутанный ключ виден только глазами:
 * «Редакция от 30 июля» в английском договоре собирается и типизируется без единой жалобы.
 */
test.each(['offer', 'privacy'])('документ /%s печатает дату и реквизиты на своём языке', (route) => {
	const ru = builtPage(`${route}/index.html`)
	const en = builtPage(`en/${route}/index.html`)

	expect(ru).toContain(TERMS_DATE_LABEL.ru)
	expect(ru).not.toContain(TERMS_DATE_LABEL.en)
	expect(en).toContain(TERMS_DATE_LABEL.en)
	expect(en).not.toContain(TERMS_DATE_LABEL.ru)

	expect(ru).toContain(OPERATOR.name.ru)
	expect(en).toContain(OPERATOR.name.en)
	expect(en).not.toContain(OPERATOR.name.ru)
})

/** Заполненные реквизиты — это опубликованные документы: закрывать их от индексации нечем. */
test('опубликованные документы не помечены noindex', () => {
	expect(IS_DRAFT).toBe(false)

	for (const route of routes) {
		expect(builtPage(`${route}/index.html`)).not.toContain('name="robots"')
		expect(builtPage(`en/${route}/index.html`)).not.toContain('name="robots"')
	}
})

function canonical(html: string) {
	return html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
}

function alternates(html: string) {
	return Object.fromEntries(
		[...html.matchAll(/<link rel="alternate" hreflang="(ru|en)" href="([^"]+)"/g)].map(
			([, lang, href]) => [lang, href],
		),
	)
}

function langOf(html: string) {
	return html.match(/<html lang="([^"]+)"/)?.[1]
}

/**
 * Сайт собирается один раз на весь файл: `astro build` занимает пару секунд, а проверять
 * метаданные имеет смысл только на настоящем выводе. Публичный адрес подставляется свой,
 * чтобы тест не зависел от боевого домена.
 */
let built: Map<string, string> | undefined

function builtPage(file: string) {
	built ??= buildSite()

	const html = built.get(file)
	expect(`${file} built: ${html !== undefined}`).toBe(`${file} built: true`)

	return html as string
}

function buildSite() {
	const websiteRoot = resolve(import.meta.dirname, '..')
	const result = spawnSync('bunx', ['astro', 'build'], {
		cwd: websiteRoot,
		encoding: 'utf8',
		env: { ...process.env, PUBLIC_WEBSITE_URL: SITE, PUBLIC_WEBAPP_URL: `${SITE}/app` },
	})

	expect(`astro build exit ${result.status}: ${result.stderr}`).toBe('astro build exit 0: ')

	const distDir = resolve(websiteRoot, 'dist')

	return new Map(
		readdirSync(distDir, { recursive: true })
			.map(String)
			.map((entry) => entry.split(sep).join('/'))
			.filter((entry) => entry.endsWith('.html'))
			.map((entry) => [entry, readFileSync(resolve(distDir, entry), 'utf8')]),
	)
}

/** Правовая страница — та, что печатает реквизиты: только у неё режим черновика имеет смысл. */
function legalPageSources() {
	const pagesDir = resolve(import.meta.dirname, '../src/pages')

	return readdirSync(pagesDir, { recursive: true })
		.map(String)
		.filter((entry) => entry.endsWith('.astro'))
		.map((entry) => ({
			// Windows отдаёт `en\offer.astro`; сравнения ниже идут по маршрутам, а они со слэшем.
			path: entry.split(sep).join('/'),
			source: readFileSync(resolve(pagesDir, entry), 'utf8'),
		}))
		.filter(({ source }) => /from '(\.\.\/)+legal'/.test(source))
}
