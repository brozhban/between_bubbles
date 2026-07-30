import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

/**
 * Реквизиты правообладателя и дата редакции правовых документов.
 *
 * Одно место на три страницы: оферта, политика и контакты печатают одни и те же значения,
 * а `CURRENT_TERMS_VERSION` из контрактов гарантирует, что дата в шапке документа совпадает
 * с версией, которую webapp записывает в согласие при регистрации (ТЗ §14).
 *
 * Пока хотя бы одно поле пустое, страницы помечены как черновик и закрыты от индексации.
 * Заполнение этого файла — единственная правка кода, которая нужна для публикации.
 */

export interface Operator {
	/** Полное наименование: «Индивидуальный предприниматель Фамилия Имя». */
	name: string
	/** Идентификационный номер ИП в реестре Грузии. */
	registration: string
	/** Адрес для юридически значимых сообщений. */
	address: string
	/** Почта поддержки, обращений по персональным данным и досудебных претензий. */
	email: string
	/** Право какой страны применяется, в родительном падеже: «Грузии». */
	jurisdiction: string
	/** Где рассматриваются споры, если переписка не помогла. */
	disputeVenue: string
}

export const OPERATOR = {
	name: 'Индивидуальный предприниматель MAKSIM GUSEV',
	registration: 'идентификационный номер / Tax ID: 304665609',
	address:
		'Грузия, г. Тбилиси, Крцанисский район, поселение Поничала 3, корпус 5, подъезд 2, этаж 4',
	email: 'labotanik77@gmail.com',
	// Правообладатель — ИП, зарегистрированное в Грузии (ответ заказчика 30.07.2026).
	jurisdiction: 'Грузии',
	disputeVenue: 'судами Грузии по месту нахождения Правообладателя',
} satisfies Operator

/** Черновик, пока заказчик не подтвердил реквизиты (ТЗ §17, вопрос 6). */
export const IS_DRAFT = Object.values(OPERATOR).some((value) => value.trim() === '')

export const TERMS_VERSION = CURRENT_TERMS_VERSION

const termsDate = new Date(`${CURRENT_TERMS_VERSION}T00:00:00Z`)

export const TERMS_DATE_LABEL = new Intl.DateTimeFormat('ru-RU', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
}).format(termsDate)

export const TERMS_DATE_LABEL_EN = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
}).format(termsDate)

/** Незаполненный реквизит показываем как явный пропуск, а не как пустое место в тексте. */
export function field(value: string, description: string) {
	return value.trim() === '' ? `[${description}]` : value
}
