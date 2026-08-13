import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { registroDetalleAccion } from './accionDetalle/registro'
import type { ICatalogoItem } from '@/types/planificacion'

export interface IAccionSinMarca {
    accion: string
    params?: unknown
}

interface AccionComercialPickerProps {
    acciones: ICatalogoItem[]
    value: IAccionSinMarca | null
    onChange: (value: IAccionSinMarca | null) => void
}

/** "¿Con acción comercial?": con qué se ofreció este rubro (Plan cupo, Descuento) y con
 *  qué parámetros. La marca es un chip aparte (`MarcaOfrecimientoPicker`) — este
 *  componente no la conoce. Colapsado por defecto y opcional: la mayoría de los rubros
 *  se resuelven sin acción, y ahí la pantalla queda igual que siempre.
 *
 *  Una vez elegida una acción, las opciones (Sin acción / Plan cupo / Descuento…) se
 *  colapsan a un resumen de una línea: mostrarlas siempre lado a lado no aporta nada
 *  después de elegir, y con varias acciones en el catálogo se come la pantalla. Tocar
 *  el resumen las vuelve a desplegar para cambiar de opción.
 *
 *  Presentacional puro: el catálogo llega por props (lo pide ResolucionWizard), así que
 *  su test no necesita React Query. Los editores de parámetros salen del registro por
 *  código de acción (accionDetalle/registro.ts) — sumar una acción con parámetros
 *  nuevos no toca este archivo. */
export default function AccionComercialPicker({ acciones, value, onChange }: AccionComercialPickerProps) {
    const [abierto, setAbierto] = useState(!!value)
    const [eligiendo, setEligiendo] = useState(!value)

    const moduloDetalle = value ? registroDetalleAccion[value.accion] : undefined
    const descripcionElegida = value ? (acciones.find(a => a.code === value.accion)?.description ?? value.accion) : null
    // Editores de un solo campo chico (ej. Descuento) entran en la misma fila que el
    // resumen — un select + un input al lado, como cualquier form compacto. Los que no
    // entran en una línea (Cupo, lista de tramos) van debajo, en su propio bloque.
    const esInline = moduloDetalle?.layout === 'inline'

    // Cambiar de acción descarta los params: los tramos de un Cupo no significan nada
    // para un Descuento (que es un % suelto).
    function elegirAccion(item: ICatalogoItem) {
        onChange({ accion: item.code })
        setEligiendo(false)
    }

    if (!abierto && !value) {
        return (
            <button
                type="button"
                onClick={() => {
                    setAbierto(true)
                    setEligiendo(true)
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#8A93A6]">
                    ¿Con acción comercial?
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
            </button>
        )
    }

    return (
        <div className="animate-panel-in mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Acción comercial
            </span>

            {eligiendo ? (
                <div className="animate-panel-in flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            onChange(null)
                            setAbierto(false)
                        }}
                        className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                            value
                                ? 'border-[#E1E6F0] bg-white text-[#3B4560]'
                                : 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                        }`}
                    >
                        Sin acción
                    </button>
                    {acciones.map(a => {
                        const on = value?.accion === a.code
                        return (
                            <button
                                key={a.code}
                                type="button"
                                onClick={() => elegirAccion(a)}
                                className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                                    on
                                        ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                        : 'border-[#E1E6F0] bg-white text-[#3B4560]'
                                }`}
                            >
                                {a.description}
                            </button>
                        )
                    })}
                </div>
            ) : (
                <div className="animate-panel-in flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setEligiendo(true)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E1E6F0] bg-[#EEF3FB] px-2.5 py-2 text-left"
                    >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#182645]">
                            {descripcionElegida}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </button>
                    {value && moduloDetalle && esInline && (
                        <moduloDetalle.Editor
                            value={value.params}
                            onChange={params => onChange({ ...value, params })}
                        />
                    )}
                </div>
            )}

            {value && moduloDetalle && !esInline && (
                <div className="animate-panel-in">
                    <moduloDetalle.Editor
                        value={value.params}
                        onChange={params => onChange({ ...value, params })}
                    />
                </div>
            )}
        </div>
    )
}
