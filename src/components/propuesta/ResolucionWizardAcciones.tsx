import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motivoIncompleto } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardAccionesProps {
    rubros: IVisitaRubro[]
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — la única fuente de verdad mientras la
     *  visita está abierta; no se guarda contra el backend hasta "Cerrar visita"
     *  (ver VisitaSheet.cerrarConBorrador). */
    borradores: Record<number, IRubroMotivo[]>
    onIndexChange: (index: number) => void
    /** Cierra el wizard y vuelve a la lista. El cambio ya vive en `borradores` (se
     *  actualiza en cada tilde vía onCambiarBorrador), así que acá no hay nada que
     *  guardar ni ningún estado de carga. */
    onFinalizar: () => void
}

/** Atrás / Siguiente-o-Finalizar. Se renderiza en el pie FIJO del sheet (fuera del área
 *  de scroll) para que siga a la vista aunque el detalle de un motivo (ej. Precio) empuje
 *  el contenido hacia abajo — si viviera en el scroll, expandir el detalle lo tapa. */
export default function ResolucionWizardAcciones({
    rubros,
    index,
    motivos,
    borradores,
    onIndexChange,
    onFinalizar,
}: ResolucionWizardAccionesProps) {
    const esUltimo = index === rubros.length - 1

    let bloqueado: IVisitaRubro | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of rubros) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? rubros.findIndex(r => r.id === bloqueado!.id) : -1

    return (
        <div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => onIndexChange(index - 1)}
                    className="h-12 flex-1 text-[13.5px] font-bold"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    Atrás
                </Button>
                {esUltimo ? (
                    <Button
                        onClick={onFinalizar}
                        disabled={!!bloqueado}
                        className="h-12 flex-1 bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                    >
                        Finalizar
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={() => onIndexChange(index + 1)}
                        className="h-12 flex-1 text-[13.5px] font-bold"
                    >
                        Siguiente
                        <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    </Button>
                )}
            </div>

            {bloqueado && motivoBloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {motivoBloqueante.descripcion} en {bloqueado.rubroDescripcion} (rubro{' '}
                    {bloqueadoIndex + 1} de {rubros.length}).
                </p>
            )}
        </div>
    )
}
