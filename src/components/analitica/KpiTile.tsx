import HelpPopover from './HelpPopover'

interface KpiTileProps {
    titulo: string
    valor: string
    nota?: string
    /** Contra qué meta mensual se compara este valor, ej. "Meta: 100 hs/mes".
     *  Se muestra siempre visible, no solo en la ayuda. */
    meta?: string
    /** Explicación en lenguaje de gerencia de qué mide y cómo se calcula este KPI. */
    ayuda?: React.ReactNode
}

export default function KpiTile({ titulo, valor, nota, meta, ayuda }: KpiTileProps) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                {titulo}
                {ayuda && <HelpPopover label={`Qué significa ${titulo}`}>{ayuda}</HelpPopover>}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {meta && <p className="mt-0.5 text-xs text-slate-400">{meta}</p>}
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}
