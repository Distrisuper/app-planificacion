import type { ReactNode } from 'react'
import HelpPopover from '@/components/analitica/HelpPopover'

interface TileMarcoProps { titulo: string; ayuda: string; ancho?: 'simple' | 'doble'; children: ReactNode }

export default function TileMarco({ titulo, ayuda, ancho = 'simple', children }: TileMarcoProps) {
    return (
        <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(24,38,69,.06)] ${ancho === 'doble' ? 'col-span-2' : ''}`}>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-dsmuted">
                <span className="truncate">{titulo}</span>
                <HelpPopover label={`Qué significa ${titulo}`} align="left">{ayuda}</HelpPopover>
            </p>
            <div className="mt-1.5">{children}</div>
        </div>
    )
}
