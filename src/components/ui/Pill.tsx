import type { ReactNode } from 'react'
import type { Tono } from '@/lib/misMetricas'
import { cn } from '@/lib/utils'

/** El semáforo único: ok, atención, mal o neutro (sin objetivo / s/d). */
export type TonoPill = 'ok' | 'atencion' | 'mal' | 'neutro'

const CLASE_TONO: Record<TonoPill, string> = {
    ok: 'bg-estado-ok-fondo text-estado-ok-texto',
    atencion: 'bg-estado-atencion-fondo text-estado-atencion-texto',
    mal: 'bg-estado-mal-fondo text-estado-mal-texto',
    neutro: 'bg-estado-neutro-fondo text-estado-neutro-texto',
}

/** El `Tono` de cumplimiento (`tonoCumplimiento`: ≥80% ok, ≥50% medio, resto bajo) en el semáforo. */
export const TONO_PILL: Record<Tono, TonoPill> = { ok: 'ok', medio: 'atencion', bajo: 'mal', neutro: 'neutro' }

interface PillProps {
    tono: TonoPill
    children: ReactNode
    /** Punto de color antes del texto. Por defecto sí; sin punto para escalas (▲ ▼). */
    punto?: boolean
    className?: string
}

/** Estado con texto: nunca solo color. Una sola métrica coloreada por fila. */
export default function Pill({ tono, children, punto = true, className }: PillProps) {
    return (
        <span
            data-tono={tono}
            className={cn(
                'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold tabular-nums',
                CLASE_TONO[tono],
                className,
            )}
        >
            {punto && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
            {children}
        </span>
    )
}
