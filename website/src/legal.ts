import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

/**
 * Реквизиты правообладателя, применимое право и дата редакции правовых документов.
 *
 * Одно место на шесть страниц: оферта, политика и контакты в обеих языковых версиях печатают
 * одни и те же значения, а `CURRENT_TERMS_VERSION` из контрактов гарантирует, что дата
 * в шапке документа совпадает с версией, которую webapp записывает в согласие при
 * регистрации (ТЗ §14).
 *
 * Всё, что различает языковые версии по существу, лежит здесь парой `{ ru, en }`: факт,
 * повторённый прозой на второй странице, рано или поздно разойдётся с первой, а это два
 * разных договора.
 *
 * Пока хотя бы одно поле пустое, страницы помечены как черновик и закрыты от индексации.
 * Заполнение этого файла — единственная правка кода, которая нужна для публикации.
 */

/** Значение, которое нельзя перевести на лету: у языков разная грамматика и разные обороты. */
export type LocalizedText = { ru: string; en: string }

export type Operator = {
	/**
	 * Полное наименование с организационно-правовой формой. Форма переводится
	 * («Индивидуальный предприниматель» → «Individual Entrepreneur»), само имя — нет.
	 */
	name: LocalizedText
	/** Только сам идентификационный номер ИП в реестре Грузии; подпись к нему — в тексте страницы. */
	registration: string
	/**
	 * Адрес для юридически значимых сообщений. Английская версия — тот же адрес латиницей:
	 * кириллица в англоязычном договоре не даёт адресату отправить письмо.
	 */
	address: LocalizedText
	/** Почта поддержки, обращений по персональным данным и досудебных претензий. */
	email: string
}

export const OPERATOR = {
	name: {
		ru: 'Индивидуальный предприниматель MAKSIM GUSEV',
		en: 'Individual Entrepreneur MAKSIM GUSEV',
	},
	registration: '304665609',
	address: {
		ru: 'Грузия, г. Тбилиси, Крцанисский район, поселение Поничала 3, корпус 5, подъезд 2, этаж 4',
		en: 'Georgia, Tbilisi, Krtsanisi district, Ponichala settlement 3, building 5, entrance 2, floor 4',
	},
	email: 'labotanik77@gmail.com',
} satisfies Operator

export type LegalVenue = {
	/** Право какой страны применяется. По-русски — в родительном падеже: «Грузии». */
	jurisdiction: LocalizedText
	/** Где рассматриваются споры, если переписка не помогла. */
	disputeVenue: LocalizedText
}

/**
 * Применимое право и подсудность.
 *
 * Хранятся сразу на двух языках, а не одной строкой: русский вариант стоит в падеже
 * («право Грузии», «рассматриваются судами Грузии»), и английская страница физически не
 * может его подставить. Пока эти два факта были только русскими, английские оферта и
 * политика повторяли их прозой — и правка юрисдикции в одном месте оставляла бы английский
 * договор утверждать прежнюю страну.
 */
export const VENUE = {
	// Правообладатель — ИП, зарегистрированное в Грузии (ответ заказчика 30.07.2026).
	jurisdiction: { ru: 'Грузии', en: 'Georgia' },
	disputeVenue: {
		ru: 'судами Грузии по месту нахождения Правообладателя',
		en: 'the courts of Georgia at the location of the Rightholder',
	},
} satisfies LegalVenue

/**
 * Черновик, пока заказчик не подтвердил реквизиты (ТЗ §17, вопрос 6).
 *
 * Считает и реквизиты, и обе языковые версии юрисдикции: пустая английская формулировка —
 * такой же незаполненный документ, как пустой адрес. Вынесено в функцию, потому что от
 * этого флага зависит `noindex`: пропущенная при обходе языковая версия отправила бы
 * незаполненный договор в выдачу, и заметить это по готовой странице было бы уже поздно.
 */
export function isDraft(operator: Operator, venue: LegalVenue) {
	return [...textValues(operator), ...textValues(venue)].some((value) => value.trim() === '')
}

/** Одноязычные и двуязычные реквизиты проверяются одинаково: пустой перевод — тот же пропуск. */
function textValues(record: Record<string, string | LocalizedText>) {
	return Object.values(record).flatMap((value) =>
		typeof value === 'string' ? [value] : Object.values(value),
	)
}

export const IS_DRAFT = isDraft(OPERATOR, VENUE)

export const TERMS_VERSION = CURRENT_TERMS_VERSION

const termsDate = new Date(`${CURRENT_TERMS_VERSION}T00:00:00Z`)

/**
 * Дата редакции в шапке документа — такой же двуязычный факт, как реквизиты, поэтому и
 * хранится парой, а не двумя экспортами с суффиксом: «Редакция от 30 июля» в английском
 * договоре не ломает ни типы, ни сборку, и заметить это можно только глазами.
 * Какая страница какой ключ берёт, проверяет `website/tests/legal.test.ts`.
 *
 * UTC задан явно: дата приходит календарной строкой, и без него часовой пояс сборочной
 * машины сдвинул бы подпись на день относительно версии, записанной в согласие.
 */
export const TERMS_DATE_LABEL = {
	ru: formatTermsDate('ru-RU'),
	en: formatTermsDate('en-US'),
} satisfies LocalizedText

function formatTermsDate(locale: string) {
	return new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(termsDate)
}

/** Незаполненный реквизит показываем как явный пропуск, а не как пустое место в тексте. */
export function field(value: string, description: string) {
	return value.trim() === '' ? `[${description}]` : value
}

/**
 * Хосты, которые называет оферта: сервис — это сайт и дневник вместе, поэтому в предмете
 * договора стоят оба адреса.
 *
 * Значения приходят в сборку (`PUBLIC_WEBSITE_URL`, `PUBLIC_WEBAPP_URL`), а не в рантайм:
 * страницы полностью пререндерятся. Запасные значения — для локальной сборки; в продакшене
 * оба адреса подставляет `bun run deploy:do:specs website`, и после смены домена сайт нужно
 * пересобрать, иначе документ будет называть старый хост.
 *
 * Одно место на обе версии документа: разъехавшиеся русский и английский адреса означали бы
 * два разных предмета договора.
 */
export const WEBSITE_HOST = hostOf(
	'PUBLIC_WEBSITE_URL',
	import.meta.env.PUBLIC_WEBSITE_URL,
	'winesdiary.com',
)
export const WEBAPP_HOST = hostOf(
	'PUBLIC_WEBAPP_URL',
	import.meta.env.PUBLIC_WEBAPP_URL,
	'app.winesdiary.com',
)

/**
 * Пустое значение и сломанное — разные ошибки, и обходятся по-разному.
 *
 * Пустое законно: при первом развёртывании адреса дневника ещё нет, документ называет
 * запасной хост, сайт пересобирают позже. А вот опечатка в заданном адресе — это оферта,
 * называющая чужой сервис в предмете договора, без плашки черновика и без `noindex`.
 * Единственный факт документа, который может быть не пустым, а неверным, поэтому здесь
 * сборка падает, а не подставляет запасной хост молча.
 */
export function hostOf(name: string, url: string | undefined, fallback: string) {
	if (!url?.trim()) return fallback

	try {
		return new URL(url).host
	} catch {
		throw new Error(`${name} must be an absolute URL, got ${JSON.stringify(url)}`)
	}
}
