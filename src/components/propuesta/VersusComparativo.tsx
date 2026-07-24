import type { IRubroPropuesta } from '@/types/planificacion'

interface VersusComparativoProps {
    rubro: IRubroPropuesta
}

export default function VersusComparativo({ rubro }: VersusComparativoProps) {
    const hasComparison = rubro.clientUnits != null && rubro.zoneUnits != null
    const max = hasComparison ? Math.max(rubro.clientUnits!, rubro.zoneUnits!, 1) : 1
    const clientPct = hasComparison ? Math.round((rubro.clientUnits! / max) * 100) : 0
    const zonePct = hasComparison ? Math.round((rubro.zoneUnits! / max) * 100) : 0

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-[#182645]">{rubro.nombre}</span>
                {rubro.gapPct != null && (
                    <span className="shrink-0 rounded-full bg-[#FEECEC] px-2 py-0.5 text-[11px] font-extrabold text-dsred">
                        -{rubro.gapPct}%
                    </span>
                )}
            </div>
            {hasComparison ? (
                <>
                    <div className="mb-1.5 flex items-center gap-2">
                        <span className="w-[76px] shrink-0 text-[10.5px] font-bold text-dsgreen">Este cliente</span>
                        <div className="h-[15px] flex-1 overflow-hidden rounded-[5px] bg-[#EEF1F6]">
                            <div className="h-full rounded-[5px] bg-dsgreen" style={{ width: `${clientPct}%` }} />
                        </div>
                        <span className="w-[54px] shrink-0 text-right text-[10.5px] font-bold text-[#182645]">
                            {rubro.clientUnits}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-[76px] shrink-0 text-[10.5px] font-bold text-dsnavy">Prom. zona</span>
                        <div className="h-[15px] flex-1 overflow-hidden rounded-[5px] bg-[#EEF1F6]">
                            <div className="h-full rounded-[5px] bg-dsnavy" style={{ width: `${zonePct}%` }} />
                        </div>
                        <span className="w-[54px] shrink-0 text-right text-[10.5px] font-bold text-[#182645]">
                            {rubro.zoneUnits}
                        </span>
                    </div>
                </>
            ) : (
                <div className="text-[11.5px] text-dsmuted">Sin datos comparativos todavía.</div>
            )}
        </div>
    )
}
