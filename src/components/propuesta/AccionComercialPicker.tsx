import { useState } from 'react'
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
    /** Cuántos rubros quedan por resolver además de este. 0 = no se ofrece el check de
     *  "aplicar a restantes". */
    rubrosRestantes?: number
    /** Copia esta acción (y sus params) a los rubros restantes — una sola vez, al
     *  tildar el check. La marca de cada rubro no se toca. */
    onAplicarATodos?: () => void
}

/** "Acción comercial": con qué se ofreció este rubro (Plan cupo, Descuento) y con qué
 *  parámetros. La marca es un chip aparte (`MarcaOfrecimientoPicker`) — este componente
 *  no la conoce. Siempre desplegado, con "Sin acción" elegido por defecto: plegado
 *  detrás de un "¿Con acción comercial?" el vendedor no llegaba a ver que las opciones
 *  existían. Sigue siendo opcional — "Sin acción" es un valor válido, no un vacío.
 *
 *  Los chips (Sin acción / Plan cupo / Descuento…) quedan SIEMPRE a la vista, con el
 *  elegido resaltado, y el editor de parámetros de esa acción aparece debajo (los
 *  tramos del Cupo, el % del Descuento). Se probó colapsarlos a un resumen de una línea
 *  al elegir: ahorraba una fila, pero cambiar de acción pasaba a costar dos toques y
 *  desde el resumen no se veía qué otras opciones había.
 *
 *  Presentacional puro: el catálogo llega por props (lo pide ResolucionWizard), así que
 *  su test no necesita React Query. Los editores de parámetros salen del registro por
 *  código de acción (accionDetalle/registro.ts) — sumar una acción con parámetros
 *  nuevos no toca este archivo. */
export default function AccionComercialPicker({
    acciones,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarATodos,
}: AccionComercialPickerProps) {
    const [aplicado, setAplicado] = useState(false)

    const moduloDetalle = value ? registroDetalleAccion[value.accion] : undefined

    // Cambiar de acción descarta los params: los tramos de un Cupo no significan nada
    // para un Descuento (que es un % suelto).
    function elegirAccion(item: ICatalogoItem) {
        onChange({ accion: item.code })
    }

    return (
        <div
            className={`mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] bg-white p-2.5 ${
                value ? 'border-[#B9CCEC]' : 'border-[#E4E8F0]'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                    Acción comercial <span className="normal-case">(opcional)</span>
                </span>
                {value && rubrosRestantes > 0 && (
                    <label className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-dsnavy">
                        <input
                            type="checkbox"
                            checked={aplicado}
                            onChange={e => {
                                setAplicado(e.target.checked)
                                if (e.target.checked) onAplicarATodos?.()
                            }}
                            className="h-3.5 w-3.5 shrink-0 rounded border-[#C9D2E3] accent-dsnavy"
                        />
                        Aplicar a restantes
                    </label>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => onChange(null)}
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

            {value && moduloDetalle && (
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
