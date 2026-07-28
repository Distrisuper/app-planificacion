import { Button } from '@/components/ui/button'
import type { IRubroPropuesta } from '@/types/planificacion'

interface RubroCardProps {
    /** Nombre visible del rubro. */
    nombre: string
    gapPct?: number
    clientUnits?: IRubroPropuesta['clientUnits']
    zoneUnits?: IRubroPropuesta['zoneUnits']
    /** Motivos ya cargados. undefined = vista pre-visita: el rubro no se resuelve acá. */
    motivosCargados?: number
    /** Si falta, la card es solo lectura. */
    onResolucion?: () => void
}

export default function RubroCard({
    nombre,
    gapPct,
    clientUnits,
    zoneUnits,
    motivosCargados,
    onResolucion,
}: RubroCardProps) {
    const hasComparison = clientUnits != null && zoneUnits != null && zoneUnits > 0
    const clientPct = hasComparison ? Math.round((clientUnits! / zoneUnits!) * 100) : 0
    const resuelto = (motivosCargados ?? 0) > 0

    return (
        <div className="rounded-xl border border-dsline bg-[#FAFBFD] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-bold text-[#182645]">{nombre}</span>
                {gapPct != null && (
                    <span className="shrink-0 rounded-full bg-[#FEECEC] px-2 py-0.5 text-[11px] font-extrabold text-dsred">
                        -{gapPct}%
                    </span>
                )}
            </div>

            {hasComparison && (
                <>
                    <div className="h-[7px] overflow-hidden rounded-full bg-[#E7EAF1]">
                        <div className="h-full rounded-full bg-dsgreen" style={{ width: `${clientPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold text-[#8A93A6]">
                        <span>Este cliente: {clientUnits} u/mes</span>
                        <span>Zona: {zoneUnits} u/mes</span>
                    </div>
                </>
            )}

            {onResolucion && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onResolucion}
                    className={`mt-2 h-10 w-full text-[12.5px] font-bold ${
                        resuelto
                            ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
                            : 'border-[#D8DEEA] text-dsnavy'
                    }`}
                >
                    {resuelto
                        ? `${motivosCargados} ${motivosCargados === 1 ? 'motivo' : 'motivos'} cargados`
                        : 'Resolución'}
                </Button>
            )}
        </div>
    )
}
