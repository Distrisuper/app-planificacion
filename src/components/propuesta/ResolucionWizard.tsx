import { useState } from 'react'
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { useEliminarRubro } from '@/hooks/useRubros'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardProps {
    visitaId: number
    /** Subconjunto fijo de rubros que se está recorriendo (ya filtrado por el llamador). */
    rubros: IVisitaRubro[]
    /** Posición actual dentro de `rubros`. */
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — lo que el vendedor tildó, guardado o no. */
    borradores: Record<number, IRubroMotivo[]>
    onCambiarBorrador: (rubroId: number, motivos: IRubroMotivo[]) => void
    onVolver: () => void
}

/** Header (contexto/salida) + checklist del rubro actual. Va en el área scrolleable del
 *  sheet — la navegación y el guardado en lote viven en ResolucionWizardAcciones, que se
 *  renderiza aparte, en el pie fijo, para que no se oculten al expandirse el detalle. */
export default function ResolucionWizard({
    visitaId,
    rubros,
    index,
    motivos,
    borradores,
    onCambiarBorrador,
    onVolver,
}: ResolucionWizardProps) {
    const rubro = rubros[index]

    // El catálogo de marcas se pide desde acá y no desde ResolucionRubro: el wizard es
    // el ancestro más cercano que ve a la vez el catálogo de motivos y el borrador, así
    // que puede pedirlo SOLO cuando hace falta — y deja a ResolucionRubro presentacional
    // puro, sin React Query en su test.
    const necesitaMarcas = (borradores[rubro.id] ?? []).some(
        m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
    )
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(necesitaMarcas)

    const eliminar = useEliminarRubro(visitaId)
    const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

    // Los rubros de la propuesta NO se borran (el backend responde RUBRO_DE_PROPUESTA):
    // si no se ofreció, se resuelve con "No lo ofrecí". Poner el borrado detrás del
    // wizard (y no al lado del target grande de la fila en la tabla) evita el borrado
    // accidental.
    async function quitarRubro() {
        setErrorEliminar(null)
        try {
            await eliminar.mutateAsync(rubro.id)
            onVolver()
        } catch {
            setErrorEliminar('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        }
    }

    return (
        <div>
            {/* Sticky: el nombre del rubro es la info que más importa en esta pantalla —
             *  si scrollea con el resto (ej. al expandirse el detalle de Precio), el
             *  vendedor pierde de vista cuál está resolviendo a mitad de la lista. El
             *  -mx/px negativo hace que el fondo llegue a los bordes del sheet en vez de
             *  dejar ver el contenido de abajo por el padding lateral del scroll. */}
            <div className="sticky top-0 z-10 -mx-[18px] mb-3 flex items-center gap-2 border-b border-[#EEF0F5] bg-white px-[18px] pb-2.5">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] shrink-0 border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#182645]">
                    {rubro.rubroDescripcion}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-dsmuted">
                    {index + 1} de {rubros.length}
                </span>
                {!rubro.esPropuesto && (
                    <button
                        type="button"
                        aria-label={`Quitar ${rubro.rubroDescripcion}`}
                        onClick={quitarRubro}
                        disabled={eliminar.isPending}
                        className="shrink-0 text-dsmuted disabled:opacity-50"
                    >
                        {eliminar.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                        ) : (
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                        )}
                    </button>
                )}
            </div>

            {errorEliminar && (
                <p className="mb-2.5 rounded-[10px] bg-[#FEECEC] px-3 py-2 text-[12.5px] font-semibold text-dsred">
                    {errorEliminar}
                </p>
            )}

            <ResolucionRubro
                motivos={motivos}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={borradores[rubro.id] ?? []}
                onChange={m => onCambiarBorrador(rubro.id, m)}
            />
        </div>
    )
}
