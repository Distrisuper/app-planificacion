import type { ReactNode } from 'react'
import HelpPopover from '@/components/analitica/HelpPopover'
import { cn } from '@/lib/utils'

interface PanelProps {
    titulo: string
    /** Texto chico junto al título: lo que vale igual para todas las filas ("Objetivo: 160 por persona"). */
    subtitulo?: ReactNode
    /** Qué muestra el panel y cómo se calcula. */
    ayuda?: ReactNode
    /** Nombre del botón de ayuda; por defecto "Qué mide <título>". */
    etiquetaAyuda?: string
    /** Controles a la derecha del título. */
    acciones?: ReactNode
    children: ReactNode
    className?: string
}

/** El contenedor de una sección: tarjeta con título, subtítulo, ayuda y acciones. */
export default function Panel({ titulo, subtitulo, ayuda, etiquetaAyuda, acciones, children, className }: PanelProps) {
    return (
        <section className={cn('flex min-w-0 flex-col gap-3.5 rounded-xl border border-linea bg-tarjeta p-4', className)}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-[15.5px] font-bold text-tinta">{titulo}</h2>
                {ayuda && <HelpPopover label={etiquetaAyuda ?? `Qué mide ${titulo}`} align="left">{ayuda}</HelpPopover>}
                {subtitulo && <span className="text-[13px] text-tinta-2">{subtitulo}</span>}
                {acciones && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
            </div>
            {children}
        </section>
    )
}
