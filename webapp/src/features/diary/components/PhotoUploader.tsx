import { photoKindLabels, type EntryPhotoDto, type PhotoKind } from '@between-bubbles/contracts'
import { useRef, useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { ApiRequestError } from '@/platform/api'
import { compressToJpeg, PhotoCompressionError } from '../photo-compression'
import { useDeletePhotoMutation, useUploadPhotoMutation } from '../queries'
import { TextLinkAction } from './OutlinedButton'

const MAX_PHOTOS = 2

/**
 * Фото, выбранное в форме ещё не созданной записи: загружать его некуда, пока у записи нет id.
 * Поэтому оно ждёт сжатым в памяти формы и уезжает на сервер сразу после создания записи.
 */
export type StagedPhoto = { id: string; kind: PhotoKind; bytes: Uint8Array }

/**
 * Два режима одного блока: у сохранённой записи фото уходит на сервер сразу, у новой — копится
 * в форме. Разделять на два компонента значило бы держать две копии одной и той же сетки,
 * кнопок выбора вида и обработки ошибок.
 */
type PhotoUploaderProps =
  | { entryId: string; photos: readonly EntryPhotoDto[] }
  | { staged: readonly StagedPhoto[]; onStagedChange: (next: StagedPhoto[]) => void }

/** Источник картинки: подписанная ссылка с сервера либо байты, ещё не покинувшие браузер. */
type PhotoSource =
  | { kind: 'remote'; thumbUrl: string; fullUrl: string }
  | { kind: 'local'; bytes: Uint8Array }

/**
 * Фото записи (ТЗ §11): до двух штук — бутылка и этикетка.
 *
 * Картинка сжимается в браузере до отправки, поэтому в сеть уходит ~200 КБ вместо
 * многомегабайтного снимка с телефона. Сервер всё равно перепроверяет формат и вырезает
 * EXIF — клиентская подготовка ускоряет загрузку, но не является защитой.
 */
export function PhotoUploader(props: PhotoUploaderProps) {
  const { t, locale } = useTranslation()
  const upload = useUploadPhotoMutation()
  const remove = useDeletePhotoMutation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<PhotoKind>('BOTTLE')
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const saved = 'entryId' in props ? props : null
  const staged = 'staged' in props ? props : null

  const items = saved
    ? saved.photos.map((photo) => ({
        id: photo.id,
        kind: photo.kind,
        source: {
          kind: 'remote',
          thumbUrl: photo.thumbUrl,
          fullUrl: photo.url,
        } satisfies PhotoSource,
      }))
    : (staged?.staged ?? []).map((photo) => ({
        id: photo.id,
        kind: photo.kind,
        source: { kind: 'local', bytes: photo.bytes } satisfies PhotoSource,
      }))

  const isFull = items.length >= MAX_PHOTOS
  const expanded = items.find((item) => item.id === expandedId)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)

    try {
      const bytes = await compressToJpeg(file)
      if (saved) {
        await upload.mutateAsync({ entryId: saved.entryId, kind, bytes })
      } else if (staged) {
        staged.onStagedChange([...staged.staged, { id: crypto.randomUUID(), kind, bytes }])
      }
    } catch (caught) {
      setError(
        caught instanceof PhotoCompressionError
          ? t(caught.messageKey)
          : caught instanceof ApiRequestError
            ? caught.message
            : t('photos.uploadFailed'),
      )
    } finally {
      // Сбрасываем input, иначе повторный выбор того же файла не вызовет change.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removePhoto = (photoId: string) => {
    if (expandedId === photoId) setExpandedId(null)
    if (saved) {
      remove.mutate({ entryId: saved.entryId, photoId })
    } else if (staged) {
      staged.onStagedChange(staged.staged.filter((photo) => photo.id !== photoId))
    }
  }

  return (
    <section className="grid gap-3">
      <Typography variant="capsLabel" tone="muted">
        {t('photos.label')}
      </Typography>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {items.map((item) => (
            <figure key={item.id} className="grid gap-2">
              {/* Тап по миниатюре раскрывает полноразмерную версию — это и есть «фото крупно». */}
              <button
                type="button"
                aria-expanded={expandedId === item.id}
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <PhotoImage
                  source={item.source}
                  alt={photoKindLabels[item.kind][locale]}
                  className="h-[120px] w-[120px] border border-border object-cover"
                />
              </button>
              <Typography asChild variant="capsPole" tone="muted">
                <figcaption className="flex items-center justify-between gap-2">
                  <Typography variant="capsPole" tone="muted">
                    {photoKindLabels[item.kind][locale]}
                  </Typography>
                  <TextLinkAction type="button" arrow="" onClick={() => removePhoto(item.id)}>
                    {t('photos.remove')}
                  </TextLinkAction>
                </figcaption>
              </Typography>
            </figure>
          ))}
        </div>
      )}

      {expanded && (
        <div className="grid gap-2">
          <PhotoImage
            source={expanded.source}
            variant="full"
            alt={photoKindLabels[expanded.kind][locale]}
            className="max-h-[70vh] w-full object-contain"
          />
          <div className="justify-self-start">
            <TextLinkAction type="button" arrow="" onClick={() => setExpandedId(null)}>
              {t('photos.collapse')}
            </TextLinkAction>
          </div>
        </div>
      )}

      {!isFull && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(photoKindLabels) as PhotoKind[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={
                  kind === option
                    ? 'border border-border bg-accent-a px-3 py-2'
                    : 'border border-border px-3 py-2 hover:border-foreground'
                }
              >
                <Typography
                  variant="capsLabel"
                  className={kind === option ? 'text-accent-ink' : undefined}
                >
                  {photoKindLabels[option][locale]}
                </Typography>
              </button>
            ))}
          </div>

          <Typography asChild variant="capsNav" tone="muted">
            <label className="inline-flex cursor-pointer items-center gap-2 border border-foreground px-4 py-3">
              {upload.isPending ? t('photos.uploading') : t('photos.add')}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>
          </Typography>

          <Typography variant="caption" tone="muted">
            {staged ? t('photos.pendingHint') : t('photos.hint')}
          </Typography>
        </div>
      )}

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}
    </section>
  )
}

function PhotoImage({
  source,
  variant = 'thumb',
  alt,
  className,
}: {
  source: PhotoSource
  variant?: 'thumb' | 'full'
  alt: string
  className: string
}) {
  if (source.kind === 'local') {
    return <LocalImage bytes={source.bytes} alt={alt} className={className} />
  }

  return (
    <img
      src={variant === 'full' ? source.fullUrl : source.thumbUrl}
      alt={alt}
      className={className}
    />
  )
}

/**
 * Предпросмотр ещё не загруженного фото.
 *
 * Ссылку на объект создаёт и отзывает сам элемент: пара «создали — отозвали» обязана быть
 * неразрывной, иначе StrictMode, который цепляет и отцепляет ref дважды, отзовёт ссылку сразу
 * после создания и на экране останется битая картинка. Заодно форме не приходится помнить
 * про чистку — ссылка живёт ровно столько, сколько сама картинка на экране.
 */
function LocalImage({
  bytes,
  alt,
  className,
}: {
  bytes: Uint8Array
  alt: string
  className: string
}) {
  return (
    <img
      ref={(element) => {
        if (!element) return
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
        element.src = url
        return () => URL.revokeObjectURL(url)
      }}
      alt={alt}
      className={className}
    />
  )
}
