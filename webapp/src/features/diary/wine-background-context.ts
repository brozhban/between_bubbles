import type { WineType } from '@between-bubbles/contracts'
import { createContext, useContext, useEffect } from 'react'

/**
 * Состояние фона приложения отдельно от самих компонентов: иначе один файл экспортирует
 * и компоненты, и хук, а горячая перезагрузка на таком файле перестаёт работать.
 *
 * По умолчанию — игристое: бокал с пузырьками годится как нейтральный фон там, где
 * никакое вино не выбрано. Теперь игристое ещё и полноценный тип вина, поэтому отдельного
 * «нейтрального» варианта нет — фон всегда один из `WineType`.
 */

export type BackgroundVariant = WineType

export const DEFAULT_BACKGROUND: BackgroundVariant = 'SPARKLING'

export const WineBackgroundContext = createContext<{
	variant: BackgroundVariant
	setVariant: (variant: BackgroundVariant) => void
} | null>(null)

/**
 * Держит фон под выбранным типом, пока экран открыт, и отпускает его при уходе.
 *
 * Сброс на размонтировании обязателен: без него фон красного вина остался бы висеть
 * на неделе и в настройках после того, как человек ушёл из формы.
 */
export function useWineBackground(type: WineType | null | undefined) {
	const setVariant = useContext(WineBackgroundContext)?.setVariant

	useEffect(() => {
		if (!setVariant) return

		setVariant(type ?? DEFAULT_BACKGROUND)
		return () => setVariant(DEFAULT_BACKGROUND)
	}, [setVariant, type])
}
