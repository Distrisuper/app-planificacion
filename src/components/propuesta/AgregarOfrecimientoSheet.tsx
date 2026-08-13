import { useState } from 'react'
import OfrecimientoBuscador, { type IElegidoOfrecimiento } from './OfrecimientoBuscador'
import AlcancePicker from './AlcancePicker'
import { registroDetalleAccion } from './accionDetalle/registro'
import type { IAgregarOfrecimientoDTO, IAlcance, ICatalogoItem } from '@/types/planificacion'

interface AgregarOfrecimientoSheetProps {
    open: boolean
    onClose: () => void
    onAgregar: (dto: IAgregarOfrecimientoDTO) => void
    acciones: ICatalogoItem[]
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
}

/**
 * Alta de un ofrecimiento que NO sale de la tabla de "cómo viene comprando".
 *
 * Los rubros se siguen agregando tocando su fila en OfrecimientoTable, que además muestra los
 * números de venta al lado — ese camino no se toca. Marcas y acciones no tienen tabla
 * equivalente, y esta es su puerta de entrada.
 *
 * `OfrecimientoBuscador` mezcla los tres catálogos (rubro/marca/acción) en una sola
 * búsqueda: el tipo se deriva de qué catálogo trajo el resultado elegido, no de una
 * pestaña que el vendedor tiene que decidir antes de poder escribir.
 *
 * UI deliberadamente mínima — el rediseño del wizard es una iteración aparte.
 */
export default function AgregarOfrecimientoSheet({
    open,
    onClose,
    onAgregar,
    acciones,
    marcas,
    rubros,
    marcasLoading,
}: AgregarOfrecimientoSheetProps) {
    const [elegido, setElegido] = useState<IElegidoOfrecimiento | null>(null)
    const [alcance, setAlcance] = useState<IAlcance[]>([])
    const [detalle, setDetalle] = useState<unknown>(undefined)

    if (!open) return null

    // Solo las acciones pueden traer un módulo de detalle (tramos de Cupo, etc.) — ver
    // el registro en accionDetalle/registro.ts. Una acción sin módulo registrado (ej.
    // Promoción, todavía sin diseñar) simplemente no muestra editor.
    const moduloDetalle =
        elegido?.tipo === 'accion' ? registroDetalleAccion[elegido.codigo] : undefined

    // Elegir un ítem distinto (de cualquier tipo) descarta el alcance y el detalle: un
    // tramo cargado para "Plan cupo" no debería sobrevivir si el vendedor elige otra
    // cosa sin agregar la anterior primero.
    function elegir(item: IElegidoOfrecimiento) {
        setElegido(item)
        setAlcance([])
        setDetalle(undefined)
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo: elegido.tipo,
            codigo: elegido.codigo,
            descripcion: elegido.descripcion,
            alcance,
            ...(moduloDetalle ? { detalle } : {}),
        })
        setElegido(null)
        setAlcance([])
        setDetalle(undefined)
        onClose()
    }

    const puedeAgregar = !!elegido && (!moduloDetalle || moduloDetalle.esValido(detalle))

    return (
        <div className="flex flex-col gap-2 p-3">
            <OfrecimientoBuscador
                rubros={rubros}
                marcas={marcas}
                acciones={acciones}
                marcasLoading={marcasLoading}
                value={elegido}
                onSelect={elegir}
            />

            {elegido?.tipo === 'accion' && (
                <AlcancePicker
                    value={alcance}
                    onChange={setAlcance}
                    marcas={marcas}
                    rubros={rubros}
                    marcasLoading={marcasLoading}
                    abrirPorDefecto
                />
            )}

            {moduloDetalle && <moduloDetalle.Editor value={detalle} onChange={setDetalle} />}

            <button
                type="button"
                disabled={!puedeAgregar}
                onClick={confirmar}
                className="mt-1 rounded-[11px] bg-dsnavy px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
                Agregar
            </button>
        </div>
    )
}
