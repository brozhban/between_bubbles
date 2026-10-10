import { useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import orangeDark from '@/assets/backgrounds/orange-dark.webp'
import orangeLight from '@/assets/backgrounds/orange-light.webp'
import redDark from '@/assets/backgrounds/red-dark.webp'
import redLight from '@/assets/backgrounds/red-light.webp'
import roseDark from '@/assets/backgrounds/rose-dark.webp'
import roseLight from '@/assets/backgrounds/rose-light.webp'
import sparklingDark from '@/assets/backgrounds/sparkling-dark.webp'
import sparklingLight from '@/assets/backgrounds/sparkling-light.webp'
import whiteDark from '@/assets/backgrounds/white-dark.webp'
import whiteLight from '@/assets/backgrounds/white-light.webp'

import {
	DEFAULT_BACKGROUND,
	WineBackgroundContext,
	type BackgroundVariant,
} from './wine-background-context'

/**
 * Фон приложения: бокал в погребе за содержимым экрана.
 *
 * В форме записи он следует за выбранным типом вина. Тип приходит снизу вверх — от формы
 * к каркасу приложения, — поэтому связь сделана контекстом: складывать презентационное
 * состояние в роутер или в кэш запросов ради одной картинки значило бы тащить его через
 * слои, которым до фона нет дела.
 */

const sources: Record<BackgroundVariant, { light: string; dark: string }> = {
	SPARKLING: { light: sparklingLight, dark: sparklingDark },
	WHITE: { light: whiteLight, dark: whiteDark },
	RED: { light: redLight, dark: redDark },
	ROSE: { light: roseLight, dark: roseDark },
	ORANGE: { light: orangeLight, dark: orangeDark },
}

export function WineBackgroundProvider({ children }: { children: ReactNode }) {
	const [variant, setVariant] = useState<BackgroundVariant>(DEFAULT_BACKGROUND)
	const value = useMemo(() => ({ variant, setVariant }), [variant])

	return <WineBackgroundContext.Provider value={value}>{children}</WineBackgroundContext.Provider>
}

/**
 * Слой фона. Обе темы заданы переменными, а выбор между ними делает CSS по классу `dark`:
 * иначе пришлось бы держать в React ещё одну копию состояния темы и синхронизировать её
 * с системной настройкой, которая меняется без участия приложения.
 */
export function AppBackground() {
	const variant = useContext(WineBackgroundContext)?.variant ?? DEFAULT_BACKGROUND
	const source = sources[variant]

	return (
		<div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
			<div
				key={variant}
				className="app-background absolute inset-0 bg-cover bg-center bg-no-repeat"
				style={
					{
						'--background-image-light': `url(${source.light})`,
						'--background-image-dark': `url(${source.dark})`,
					} as CSSProperties
				}
			/>
		</div>
	)
}
