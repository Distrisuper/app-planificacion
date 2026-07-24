import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IRubroPropuesta } from '@/types/planificacion'

interface RubroCardProps {
    rubro: IRubroPropuesta
    resCount: number
    onResolucion: () => void
}

export default function RubroCard({ rubro, resCount, onResolucion }: RubroCardProps) {
    const hasComparison = rubro.clientUnits != null && rubro.zoneUnits != null && rubro.zoneUnits > 0
    const clientPct = hasComparison ? Math.round((rubro.clientUnits! / rubro.zoneUnits!) * 100) : 0

    return (
        <div className="rounded-xl border border-dsline bg-[#FAFBFD] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-bold text-[#182645]">{rubro.nombre}</span>
                {rubro.gapPct != null && (
                    <span className="shrink-0 rounded-full bg-[#FEECEC] px-2 py-0.5 text-[11px] font-extrabold text-dsred">
                        -{rubro.gapPct}%
                    </span>
                )}
            </div>

            {hasComparison && (
                <>
                    <div className="h-[7px] overflow-hidden rounded-full bg-[#E7EAF1]">
                        <div className="h-full rounded-full bg-dsgreen" style={{ width: `${clientPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold text-[#8A93A6]">
                        <span>Este cliente: {rubro.clientUnits} u/mes</span>
                        <span>Zona: {rubro.zoneUnits} u/mes</span>
                    </div>
                </>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={onResolucion}
                className="mt-2.5 h-9 w-full border-[#C9D2E3] text-[12.5px] font-bold text-dsnavy"
            >
                <ClipboardCheck className="h-[14px] w-[14px]" strokeWidth={2.2} />
                {resCount > 0 ? `Resolución · ${resCount}` : 'Resolución'}
            </Button>
        </div>
    )
}
