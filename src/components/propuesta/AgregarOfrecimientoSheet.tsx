import { useState } from 'react'
import SelectorTipoOfrecimiento, { type TipoOfrecible } from './SelectorTipoOfrecimiento'
import CatalogoPicker from './CatalogoPicker'
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
 * UI deliberadamente mínima: el rediseño del wizard es una iteración aparte.
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
    const [tipo, setTipo] = useState<TipoOfrecible>('rubro')
    const [elegido, setElegido] = useState<ICatalogoItem | null>(null)
    const [alcance, setAlcance] = useState<IAlcance[]>([])
    const [detalle, setDetalle] = useState<unknown>(undefined)

    if (!open) return null

    const catalogo = tipo === 'rubro' ? rubros : tipo === 'marca' ? marcas : acciones
    // Solo las acciones pueden traer un módulo de detalle (tramos de Cupo, etc.) — ver
    // el registro en accionDetalle/registro.ts. Una acción sin módulo registrado (ej.
    // Descuento, todavía sin diseñar) simplemente no muestra editor.
    const moduloDetalle =
        tipo === 'accion' && elegido ? registroDetalleAccion[elegido.code] : undefined

    // Cambiar de tipo invalida lo elegido, el alcance Y el detalle: un detalle cargado
    // para una acción no significa nada si el vendedor pasa a marca.
    function cambiarTipo(nuevo: TipoOfrecible) {
        setTipo(nuevo)
        setElegido(null)
        setAlcance([])
        setDetalle(undefined)
    }

    // Elegir un ítem distinto dentro del mismo tipo también descarta el detalle: un
    // tramo cargado para "Plan cupo" no debería sobrevivir si el vendedor elige otra
    // acción sin volver a tocar el selector de tipo.
    function elegir(item: ICatalogoItem) {
        setElegido(item)
        setDetalle(undefined)
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo,
            codigo: elegido.code,
            descripcion: elegido.description,
            alcance,
            ...(moduloDetalle ? { detalle } : {}),
        })
        cambiarTipo('rubro')
        onClose()
    }

    const puedeAgregar = !!elegido && (!moduloDetalle || moduloDetalle.esValido(detalle))

    return (
        <div className="flex flex-col gap-2 p-3">
            <SelectorTipoOfrecimiento value={tipo} onChange={cambiarTipo} />

            <CatalogoPicker
                items={catalogo}
                loading={tipo === 'marca' ? marcasLoading : false}
                value={elegido?.description ?? null}
                onSelect={elegir}
                placeholder={
                    tipo === 'rubro'
                        ? 'Buscar rubro…'
                        : tipo === 'marca'
                          ? 'Buscar marca…'
                          : 'Buscar acción…'
                }
            />

            {tipo === 'accion' && (
                <AlcancePicker
                    value={alcance}
                    onChange={setAlcance}
                    marcas={marcas}
                    rubros={rubros}
                    marcasLoading={marcasLoading}
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
