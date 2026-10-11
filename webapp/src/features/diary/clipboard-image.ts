/**
 * Картинка из буфера обмена для блока фото.
 *
 * Два входа, потому что ни один не покрывает всех: событие `paste` (⌘V / Ctrl+V) есть везде,
 * но на телефоне его нечем вызвать, а `navigator.clipboard.read()` работает по кнопке, зато
 * спрашивает разрешение и есть не во всех браузерах. Дальше картинка идёт тем же путём, что
 * и выбранный файл, — сжатие, вырезание геоданных и лимит в два фото общие.
 */

type ClipboardItemLike = { kind: string; type: string; getAsFile: () => File | null }

/**
 * Картинка из события вставки или `null`, если её там нет.
 *
 * Вставку в текстовое поле не перехватываем, когда в буфере есть и текст: копирование из
 * веб-страницы кладёт туда и строку, и картинку, а человек, вставляющий в «Заметки», хочет
 * именно текст. Чистая картинка в текстовое поле всё равно не вставится — её забираем.
 */
export function imageFromPaste(input: {
  items: ArrayLike<ClipboardItemLike>
  types: readonly string[]
  targetIsEditable: boolean
}): File | null {
  if (input.targetIsEditable && input.types.includes('text/plain')) return null

  for (const item of Array.from(input.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== 'file')
  )
}

/** Кнопку «Вставить из буфера» показываем только там, где браузер умеет читать картинки. */
export function canReadClipboardImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}

export class ClipboardImageError extends Error {
  readonly reason: 'empty' | 'denied'

  constructor(reason: 'empty' | 'denied') {
    super(reason)
    this.reason = reason
  }
}

/** Читает первую картинку из буфера по явному действию человека. */
export async function readClipboardImage(): Promise<File> {
  let items: ClipboardItems
  try {
    items = await navigator.clipboard.read()
  } catch {
    // Отказ в разрешении и «в буфере нет ничего читаемого» браузеры не различают надёжно.
    throw new ClipboardImageError('denied')
  }

  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith('image/'))
    if (type) return new File([await item.getType(type)], 'clipboard', { type })
  }
  throw new ClipboardImageError('empty')
}
