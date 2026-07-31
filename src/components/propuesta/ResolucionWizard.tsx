import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardProps {
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
            </div>

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
