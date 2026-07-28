import { z } from 'zod'

/**
 * Словари домена винного дневника (ТЗ §4.1, §4.2).
 *
 * Подписи живут здесь, а не только в webapp, потому что их читают три потребителя:
 * приложение, публичная карточка вина на website и экспорт CSV/JSON на бэкенде.
 */

export const currencySchema = z.enum(['GEL', 'RUB', 'USD', 'EUR'])
export const wineTypeSchema = z.enum(['WHITE', 'RED', 'ROSE', 'ORANGE'])
export const sugarLevelSchema = z.enum(['DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET'])
export const bodySchema = z.enum(['LIGHT', 'MEDIUM', 'FULL'])
export const aciditySchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])
export const tanninsSchema = z.enum([
  'GREEN',
  'ROUGH',
  'VELVET',
  'SILKY',
  'AGGRESSIVE',
  'NOT_APPLICABLE',
])
export const aftertasteSchema = z.enum(['BALANCED', 'LIGHT', 'RICH', 'HEAVY'])
export const tasteCategorySchema = z.enum(['I', 'II', 'III', 'IV', 'V', 'VI'])
export const photoKindSchema = z.enum(['BOTTLE', 'LABEL'])
export const storeKindSchema = z.enum([
  'SUPERMARKET',
  'WINE_SHOP',
  'RESTAURANT',
  'BAR',
  'ONLINE',
  'OTHER',
])

export type Currency = z.infer<typeof currencySchema>
export type WineType = z.infer<typeof wineTypeSchema>
export type SugarLevel = z.infer<typeof sugarLevelSchema>
export type Body = z.infer<typeof bodySchema>
export type Acidity = z.infer<typeof aciditySchema>
export type Tannins = z.infer<typeof tanninsSchema>
export type Aftertaste = z.infer<typeof aftertasteSchema>
export type TasteCategory = z.infer<typeof tasteCategorySchema>
export type PhotoKind = z.infer<typeof photoKindSchema>
export type StoreKind = z.infer<typeof storeKindSchema>

type Label = { ru: string; en: string }

export const currencyLabels: Record<Currency, Label> = {
  GEL: { ru: '₾ GEL', en: '₾ GEL' },
  RUB: { ru: '₽ RUB', en: '₽ RUB' },
  USD: { ru: '$ USD', en: '$ USD' },
  EUR: { ru: '€ EUR', en: '€ EUR' },
}

export const currencySymbols: Record<Currency, string> = {
  GEL: '₾',
  RUB: '₽',
  USD: '$',
  EUR: '€',
}

export const wineTypeLabels: Record<WineType, Label> = {
  WHITE: { ru: 'белое', en: 'white' },
  RED: { ru: 'красное', en: 'red' },
  ROSE: { ru: 'розовое', en: 'rosé' },
  ORANGE: { ru: 'оранж', en: 'orange' },
}

export const sugarLevelLabels: Record<SugarLevel, Label> = {
  DRY: { ru: 'сухое', en: 'dry' },
  SEMI_DRY: { ru: 'п/сух', en: 'off-dry' },
  SEMI_SWEET: { ru: 'п/сл', en: 'semi-sweet' },
  SWEET: { ru: 'сладкое', en: 'sweet' },
}

export const bodyLabels: Record<Body, Label> = {
  LIGHT: { ru: 'лёгкое', en: 'light' },
  MEDIUM: { ru: 'среднее', en: 'medium' },
  FULL: { ru: 'плотное', en: 'full' },
}

export const acidityLabels: Record<Acidity, Label> = {
  LOW: { ru: 'низкая', en: 'low' },
  MEDIUM: { ru: 'умеренная', en: 'medium' },
  HIGH: { ru: 'высокая', en: 'high' },
}

export const tanninsLabels: Record<Tannins, Label> = {
  GREEN: { ru: 'зелёные', en: 'green' },
  ROUGH: { ru: 'шершавые', en: 'rough' },
  VELVET: { ru: 'бархатные', en: 'velvety' },
  SILKY: { ru: 'шёлковые', en: 'silky' },
  AGGRESSIVE: { ru: 'агрессивные', en: 'aggressive' },
  NOT_APPLICABLE: { ru: 'не применимо', en: 'not applicable' },
}

export const aftertasteLabels: Record<Aftertaste, Label> = {
  BALANCED: { ru: 'баланс', en: 'balanced' },
  LIGHT: { ru: 'лёгкое', en: 'light' },
  RICH: { ru: 'насыщенное', en: 'rich' },
  HEAVY: { ru: 'тяжёлое', en: 'heavy' },
}

/** ТЗ §4.2. Категория выбирается вручную и не выводится из тела/кислотности/танинов. */
export const tasteCategoryLabels: Record<TasteCategory, Label> = {
  I: { ru: 'Свежее как цитрусы, кислотное', en: 'Fresh and citrusy, high acid' },
  II: { ru: 'Лёгкое с кислинкой, питкое, понятное', en: 'Light, tangy, easy-drinking' },
  III: { ru: 'Сбалансированное, ровное, приятное', en: 'Balanced, even, pleasant' },
  IV: { ru: 'Дерзкое, пикантное, необычное', en: 'Bold, piquant, unusual' },
  V: { ru: 'Обволакивающее, мягкое, округлое', en: 'Enveloping, soft, round' },
  VI: { ru: 'Глубокое, горячее, долгое, серьёзное', en: 'Deep, warm, long, serious' },
}

export const storeKindLabels: Record<StoreKind, Label> = {
  SUPERMARKET: { ru: 'супермаркет', en: 'supermarket' },
  WINE_SHOP: { ru: 'винотека', en: 'wine shop' },
  RESTAURANT: { ru: 'ресторан', en: 'restaurant' },
  BAR: { ru: 'бар', en: 'bar' },
  ONLINE: { ru: 'онлайн', en: 'online' },
  OTHER: { ru: 'другое', en: 'other' },
}

export const photoKindLabels: Record<PhotoKind, Label> = {
  BOTTLE: { ru: 'бутылка', en: 'bottle' },
  LABEL: { ru: 'этикетка', en: 'label' },
}

/** Системные теги аромата (ТЗ §4.1). Свои теги пользователь создаёт в личном пространстве. */
export const systemAromaTags: ReadonlyArray<Label> = [
  { ru: 'цитрус', en: 'citrus' },
  { ru: 'ягода', en: 'berry' },
  { ru: 'пряность', en: 'spice' },
  { ru: 'бочка', en: 'oak' },
  { ru: 'фрукт', en: 'fruit' },
  { ru: 'цветы', en: 'floral' },
  { ru: 'трава', en: 'herbal' },
]

/** Бокал = 150 мл, бутылка = 750 мл = 5 бокалов (ТЗ §1, §7.2). */
export const GLASS_ML = 150
export const BOTTLE_ML = 750
