import type { IRubroPropuesta } from '@/types/planificacion'

interface VersusComparativoProps {
    rubro: IRubroPropuesta
}

const formatoPesos = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
})

export default function VersusComparativo({ rubro }: VersusComparativoProps) {
    const esteMes = rubro.current.projected ?? rubro.current.actual
    const baseline = rubro.current.baseline
    const max = Math.max(esteMes, baseline, 1)
    const estePct = Math.round((esteMes / max) * 100)
    const basePct = Math.round((baseline / max) * 100)

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-[#182645]">{rubro.nombre}</span>
                {rubro.caidaPct != null && (
                    <span className="shrink-0 rounded-full bg-[#FEECEC] px-2 py-0.5 text-[11px] font-extrabold text-dsred">
                        {Math.round(rubro.caidaPct * 100)}%
                    </span>
                )}
            </div>
            <div className="mb-1.5 flex items-center gap-2">
                <span className="w-[76px] shrink-0 text-[10.5px] font-bold text-dsred">
                    Este mes
                </span>
                <div className="h-[15px] flex-1 overflow-hidden rounded-[5px] bg-[#EEF1F6]">
                    <div
                        className="h-full rounded-[5px] bg-dsred"
                        style={{ width: `${estePct}%` }}
                    />
                </div>
                <span className="w-[70px] shrink-0 text-right text-[10.5px] font-bold text-[#182645]">
                    ${formatoPesos.format(esteMes)}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-[76px] shrink-0 text-[10.5px] font-bold text-dsnavy">
                    Prom. 6M
                </span>
                <div className="h-[15px] flex-1 overflow-hidden rounded-[5px] bg-[#EEF1F6]">
                    <div
                        className="h-full rounded-[5px] bg-dsnavy"
                        style={{ width: `${basePct}%` }}
                    />
                </div>
                <span className="w-[70px] shrink-0 text-right text-[10.5px] font-bold text-[#182645]">
                    ${formatoPesos.format(baseline)}
                </span>
            </div>
        </div>
    )
}
