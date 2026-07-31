import { Check, Trash2 } from 'lucide-react'
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
    /** Habilita selección múltiple: aparece un check circular junto al nombre y toda
     *  la card queda tappeable para tildar/destildar (patrón galería mobile). */
    seleccionable?: boolean
    seleccionado?: boolean
    onToggleSeleccion?: () => void
    /** Si se pasa, aparece el ícono de basura dentro de la card (rubros que no son
     *  de la propuesta se pueden quitar). */
    onEliminar?: () => void
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
    seleccionable,
    seleccionado,
    onToggleSeleccion,
    onEliminar,
}: RubroCardProps) {
    const resuelto = (motivosCargados ?? 0) > 0

    return (
        <div
            role={seleccionable ? 'button' : undefined}
            tabIndex={seleccionable ? 0 : undefined}
            onClick={seleccionable ? onToggleSeleccion : undefined}
            className={`rounded-xl border p-3 transition-colors ${
                seleccionado ? 'border-dsnavy bg-[#EEF2FB]' : 'border-dsline bg-[#FAFBFD]'
            } ${seleccionable ? 'cursor-pointer' : ''}`}
        >
            <div className="mb-2 flex items-center gap-2">
                {seleccionable && (
                    <button
                        type="button"
                        aria-label={`Seleccionar ${nombre}`}
                        onClick={e => {
                            e.stopPropagation()
                            onToggleSeleccion?.()
                        }}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px]"
                        style={{
                            borderColor: seleccionado ? '#213D82' : '#CBD2E0',
                            background: seleccionado ? '#213D82' : '#fff',
                            color: seleccionado ? '#fff' : 'transparent',
                        }}
                    >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                )}
                <span className="flex-1 truncate text-[13.5px] font-bold text-[#182645]">{nombre}</span>
                {caidaPct != null && (
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                            isFallback ? 'bg-[#EEF1F6] text-dsmuted' : 'bg-[#FEECEC] text-dsred'
                        }`}
                    >
                        {Math.round(caidaPct * 100)}%
                    </span>
                )}
                {/* Los de la propuesta NO se borran (RUBRO_DE_PROPUESTA): si no se
                    ofreció, se resuelve con "No lo ofrecí". */}
                {onEliminar && (
                    <button
                        type="button"
                        aria-label={`Quitar ${nombre}`}
                        onClick={e => {
                            e.stopPropagation()
                            onEliminar()
                        }}
                        className="shrink-0 text-dsmuted"
                    >
                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                    </button>
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
                    aria-label={`Resolución de ${nombre}`}
                    onClick={e => {
                        e.stopPropagation()
                        onResolucion()
                    }}
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
