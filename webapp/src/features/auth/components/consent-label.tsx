import { Typography } from '@/components/ui/typography'
import { offerUrl, privacyUrl } from '@/platform/legal'
import { useTranslation } from '../use-translation'

/** Захватывающая группа обязательна: `split` должен вернуть сами метки, а не выбросить их. */
const linkMarkerPattern = /(\{offer\}|\{privacy\})/

/**
 * Подпись к галочке согласия.
 *
 * Согласие фиксирует в базе версию оферты (ТЗ §14), поэтому документы должны открываться
 * до нажатия, а не после. Предложение остаётся одной переводимой строкой с метками
 * `{offer}` и `{privacy}`: порядок слов задаёт перевод, а не вёрстка — в английском
 * артикли стоят иначе, чем в русском.
 *
 * Метки в обеих локалях проверяет `webapp/tests/consent-label.test.tsx`: потерянная при
 * переводе метка тихо превратила бы ссылку в обычный текст, и человек согласился бы
 * с документом, который негде открыть.
 *
 * `id` нужен галочке: она ссылается на этот текст через `aria-labelledby`, иначе скринридер
 * читает «флажок, не отмечен» и человек соглашается неизвестно с чем. Обернуть в `<label>`
 * нельзя — клик по нему перехватывал бы ссылки на документы.
 *
 * `id` обязателен: без него `aria-labelledby` указывал бы в пустоту, и потеря доступного
 * имени прошла бы молча — компонент выглядел бы точно так же.
 */
export function ConsentLabel({ id }: { id: string }) {
  const { t, locale } = useTranslation()

  const links = {
    '{offer}': { href: offerUrl(locale), label: t('auth.consentOffer') },
    '{privacy}': { href: privacyUrl(locale), label: t('auth.consentPrivacy') },
  }

  return (
    <Typography id={id} variant="bodySm" tone="muted">
      {t('auth.consent')
        .split(linkMarkerPattern)
        .map((part, index) => {
          const link = links[part as keyof typeof links]
          if (!link) return part

          return (
            <Typography key={`${part}-${index}`} asChild variant="bodySm">
              <a className="underline" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </Typography>
          )
        })}
    </Typography>
  )
}
