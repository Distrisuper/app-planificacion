import type { ReactNode } from 'react'
import HelpPopover from '@/components/analitica/HelpPopover'
import { cn } from '@/lib/utils'

interface KpiProps {
    /** En sentence case: "Cumplimiento de visitas", nunca en mayúsculas. */
    etiqueta: string
    valor: ReactNode
    /** Línea gris de abajo: el estado (con `Pill`) y de qué sale el número. */
    pie?: ReactNode
    /** Qué mide y contra qué. */
    ayuda?: ReactNode
    className?: string
}

/** Un indicador a su ancho natural (200–260 px): no se estira para llenar la fila. */
export function Kpi({ etiqueta, valor, pie, ayuda, className }: KpiProps) {
    return (
        <div
            className={cn(
                'flex min-w-[200px] flex-[0_1_260px] flex-col gap-1 rounded-xl border border-linea bg-tarjeta px-4 py-3',
                className,
            )}
        >
            <span className="flex items-center gap-1.5 text-[12.5px] text-tinta-2">
                {etiqueta}
                {ayuda && <HelpPopover label={`Qué mide ${etiqueta}`} align="left">{ayuda}</HelpPopover>}
            </span>
            <span className="text-[28px] font-bold leading-tight tabular-nums text-tinta">{valor}</span>
            {pie && <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-tinta-2">{pie}</span>}
        </div>
    )
}

/** La fila de KPIs: cada uno a su ancho, y bajan de renglón si no entran. */
export function FilaKpi({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('flex flex-wrap items-start gap-3', className)}>{children}</div>
}
