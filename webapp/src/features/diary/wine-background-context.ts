import type { WineType } from '@between-bubbles/contracts'
import { createContext, useContext, useEffect } from 'react'

/**
 * Состояние фона приложения отдельно от самих компонентов: иначе один файл экспортирует
 * и компоненты, и хук, а горячая перезагрузка на таком файле перестаёт работать.
 *
 * По умолчанию — игристое. Отдельным типом вина оно в продукте не является
 * (`wineTypeSchema` знает только четыре), поэтому это нейтральное состояние, а не
 * пятый вариант выбора.
 */

export type BackgroundVariant = 'sparkling' | WineType

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

		setVariant(type ?? 'sparkling')
		return () => setVariant('sparkling')
	}, [setVariant, type])
}
