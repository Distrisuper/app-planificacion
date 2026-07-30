import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
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

    return (
        <div>
            <div className="mb-1 flex items-center justify-between gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[12.5px] font-bold text-dsmuted">
                    {index + 1} de {rubros.length}
                </span>
            </div>

            <ResolucionRubro
                rubro={rubro}
                motivos={motivos}
                value={borradores[rubro.id] ?? []}
                onChange={m => onCambiarBorrador(rubro.id, m)}
            />
        </div>
    )
}
