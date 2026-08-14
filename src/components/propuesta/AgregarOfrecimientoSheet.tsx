import { useState } from 'react'
import OfrecimientoBuscador, { type IElegidoOfrecimiento } from './OfrecimientoBuscador'
import type { IAgregarOfrecimientoDTO, ICatalogoItem } from '@/types/planificacion'

interface AgregarOfrecimientoSheetProps {
    open: boolean
    onClose: () => void
    onAgregar: (dto: IAgregarOfrecimientoDTO) => void
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
}

/**
 * Alta de un ofrecimiento que NO sale de la tabla de "cómo viene comprando".
 *
 * Los rubros se siguen agregando tocando su fila en OfrecimientoTable, que además muestra los
 * números de venta al lado — ese camino no se toca. Las marcas no tienen tabla equivalente,
 * y esta es su puerta de entrada. Las acciones comerciales (Plan cupo, Descuento) NO se
 * agregan acá: se cargan al resolver un rubro (ver AccionComercialPicker).
 *
 * `OfrecimientoBuscador` mezcla los dos catálogos (rubro/marca) en una sola búsqueda: el
 * tipo se deriva de qué catálogo trajo el resultado elegido, no de una pestaña que el
 * vendedor tiene que decidir antes de poder escribir.
 *
 * UI deliberadamente mínima — el rediseño del wizard es una iteración aparte.
 */
export default function AgregarOfrecimientoSheet({
    open,
    onClose,
    onAgregar,
    marcas,
    rubros,
    marcasLoading,
}: AgregarOfrecimientoSheetProps) {
    const [elegido, setElegido] = useState<IElegidoOfrecimiento | null>(null)

    if (!open) return null

    function elegir(item: IElegidoOfrecimiento) {
        setElegido(item)
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo: elegido.tipo,
            codigo: elegido.codigo,
            descripcion: elegido.descripcion,
            alcance: [],
        })
        setElegido(null)
        onClose()
    }

    const puedeAgregar = !!elegido

    return (
        <div className="flex flex-col gap-2 p-3">
            <OfrecimientoBuscador
                rubros={rubros}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={elegido}
                onSelect={elegir}
            />

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
