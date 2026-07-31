import { Button } from '@/components/ui/button'

interface RubroCardProps {
    /** Nombre visible del rubro. */
    nombre: string
    /** -0.62 = cayó 62%. undefined = vista post-visita, no aplica. */
    caidaPct?: number | null
    pesosPerdidos?: number
    /** true = relleno hasta el limit, no llegó al umbral de caída sostenida. */
    isFallback?: boolean
    /** Motivos ya cargados. undefined = vista pre-visita: el rubro no se resuelve acá. */
    motivosCargados?: number
    /** Si falta, la card es solo lectura. */
    onResolucion?: () => void
}

const formatoPesos = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
})

export default function RubroCard({
    nombre,
    caidaPct,
    pesosPerdidos,
    isFallback,
    motivosCargados,
    onResolucion,
}: RubroCardProps) {
    const resuelto = (motivosCargados ?? 0) > 0

    return (
        <div className="rounded-xl border border-dsline bg-[#FAFBFD] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-bold text-[#182645]">{nombre}</span>
                {caidaPct != null && (
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                            isFallback ? 'bg-[#EEF1F6] text-dsmuted' : 'bg-[#FEECEC] text-dsred'
                        }`}
                    >
                        {Math.round(caidaPct * 100)}%
                    </span>
                )}
            </div>

            {pesosPerdidos != null && pesosPerdidos > 0 && (
                <div className="text-[10.5px] font-semibold text-[#8A93A6]">
                    Perdés ~${formatoPesos.format(pesosPerdidos)}/mes
                </div>
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
                        ? `${motivosCargados} ${motivosCargados === 1 ? 'motivo' : 'motivos'} cargado${motivosCargados === 1 ? '' : 's'}`
                        : 'Resolución'}
                </Button>
            )}
        </div>
    )
}
