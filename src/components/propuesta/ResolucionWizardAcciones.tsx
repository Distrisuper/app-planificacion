import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motivoIncompleto, motivosIguales } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardAccionesProps {
    rubros: IVisitaRubro[]
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — lo que el vendedor tildó, guardado o no. */
    borradores: Record<number, IRubroMotivo[]>
    /** Última versión CONFIRMADA por el servidor por rubroId — contra esto se calculan
     *  los cambios pendientes. */
    guardados: Record<number, IRubroMotivo[]>
    /** rubroId -> mensaje de error, para los que fallaron en el último intento de guardado. */
    fallidos: Record<number, string>
    guardando?: boolean
    onIndexChange: (index: number) => void
    /** Guarda TODOS los cambios pendientes del wizard en lote y, si no queda ninguno
     *  fallido, cierra el wizard. Es la única acción de guardado: no hay un botón de
     *  guardar aparte — sería redundante con "recorrer y finalizar". */
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
    guardados,
    fallidos,
    guardando,
    onIndexChange,
    onFinalizar,
}: ResolucionWizardAccionesProps) {
    const esUltimo = index === rubros.length - 1

    // Contra `guardados`, no contra `rubros[i].motivos`: ese último queda congelado al
    // abrir el wizard, así que un guardado exitoso a mitad de recorrido no lo actualiza.
    const pendientes = rubros.filter(r => !motivosIguales(borradores[r.id] ?? [], guardados[r.id] ?? []))

    let bloqueado: IVisitaRubro | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of pendientes) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? rubros.findIndex(r => r.id === bloqueado!.id) : -1

    const fallidosRubros = rubros.filter(r => fallidos[r.id])
    const hayFallidos = fallidosRubros.length > 0

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
                        loading={guardando}
                        className={`h-12 flex-1 text-[13.5px] ${
                            hayFallidos ? 'bg-dsred hover:bg-dsred/90' : 'bg-dsgreen hover:bg-dsgreen/90'
                        }`}
                    >
                        {guardando ? 'Guardando…' : hayFallidos ? `Reintentar (${pendientes.length})` : 'Finalizar'}
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

            {hayFallidos && (
                <p className="mt-2 text-[12.5px] font-semibold text-dsred">
                    No se pudo guardar: {fallidosRubros.map(r => r.rubroDescripcion).join(', ')}.
                </p>
            )}
        </div>
    )
}
