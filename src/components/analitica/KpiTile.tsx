import { Info } from 'lucide-react'

interface KpiTileProps {
    titulo: string
    valor: string
    nota?: string
    /** Explicación en lenguaje de gerencia de qué mide y cómo se calcula este KPI.
     *  Se muestra como tooltip nativo (title) sobre un ícono de ayuda. */
    info?: string
}

export default function KpiTile({ titulo, valor, nota, info }: KpiTileProps) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                {titulo}
                {info && (
                    <span title={info}>
                        <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    </span>
                )}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}
