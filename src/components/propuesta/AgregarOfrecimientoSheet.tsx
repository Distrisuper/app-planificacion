import { useState } from 'react'
import SelectorTipoOfrecimiento, { type TipoOfrecible } from './SelectorTipoOfrecimiento'
import CatalogoPicker from './CatalogoPicker'
import AlcancePicker from './AlcancePicker'
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

    if (!open) return null

    const catalogo = tipo === 'rubro' ? rubros : tipo === 'marca' ? marcas : acciones

    // Cambiar de tipo invalida lo elegido Y el alcance: un alcance cargado para una
    // acción no significa nada si el vendedor pasa a marca.
    function cambiarTipo(nuevo: TipoOfrecible) {
        setTipo(nuevo)
        setElegido(null)
        setAlcance([])
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo,
            codigo: elegido.code,
            descripcion: elegido.description,
            alcance,
        })
        cambiarTipo('rubro')
        onClose()
    }

    return (
        <div className="flex flex-col gap-2 p-3">
            <SelectorTipoOfrecimiento value={tipo} onChange={cambiarTipo} />

            <CatalogoPicker
                items={catalogo}
                loading={tipo === 'marca' ? marcasLoading : false}
                value={elegido?.description ?? null}
                onSelect={setElegido}
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

            <button
                type="button"
                disabled={!elegido}
                onClick={confirmar}
                className="mt-1 rounded-[11px] bg-dsnavy px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
                Agregar
            </button>
        </div>
    )
}
