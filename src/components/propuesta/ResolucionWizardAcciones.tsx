import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motivoIncompleto } from '@/lib/resolucionOfrecimiento'
import type { IMotivo, IOfrecimiento, IOfrecimientoMotivo } from '@/types/planificacion'

interface ResolucionWizardAccionesProps {
    ofrecimientos: IOfrecimiento[]
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por ofrecimientoId — la única fuente de verdad mientras la
     *  visita está abierta; no se guarda contra el backend hasta "Cerrar visita"
     *  (ver VisitaSheet.cerrarConBorrador). */
    borradores: Record<number, IOfrecimientoMotivo[]>
    onIndexChange: (index: number) => void
    /** Cierra el wizard y vuelve a la lista. El cambio ya vive en `borradores` (se
     *  actualiza en cada tilde vía onCambiarBorrador), así que acá no hay nada que
     *  guardar ni ningún estado de carga. */
    onFinalizar: () => void
}

/** Atrás / Ver lista / Siguiente-o-Finalizar. Se renderiza en el pie FIJO del sheet (fuera del área
 *  de scroll) para que siga a la vista aunque el detalle de un motivo (ej. Precio) empuje
 *  el contenido hacia abajo — si viviera en el scroll, expandir el detalle lo tapa. */
export default function ResolucionWizardAcciones({
    ofrecimientos,
    index,
    motivos,
    borradores,
    onIndexChange,
    onFinalizar,
}: ResolucionWizardAccionesProps) {
    const esUltimo = index === ofrecimientos.length - 1

    let bloqueado: IOfrecimiento | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of ofrecimientos) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? ofrecimientos.findIndex(r => r.id === bloqueado!.id) : -1

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
                {/* Salida al alcance del pulgar: minimiza el wizard y vuelve a la lista.
                 *  Sin texto — la flecha hacia abajo ya se lee como "minimizar" (mismo
                 *  lenguaje que el botón del header del sheet). La misma salida que el ‹
                 *  del header, que queda arriba a la izquierda y se confunde con "Atrás"
                 *  (mismo ícono, distinto significado: uno sale a la lista, el otro va al
                 *  rubro anterior). En el último rubro no va: ahí "Finalizar" ya es esto
                 *  mismo.
                 *
                 *  NO se deshabilita con `bloqueado`, a diferencia de Finalizar: es la
                 *  vía de escape de quien entró por error, y un escape deshabilitado deja
                 *  al vendedor encerrado en un rubro que no quería abrir. Salir con un
                 *  detalle a medias no rompe nada — el rubro queda con el chip en ámbar y
                 *  "Cerrar visita" sigue bloqueado hasta completarlo. */}
                {!esUltimo && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onFinalizar}
                        aria-label="Minimizar y ver lista"
                        className="h-12 w-12 shrink-0 rounded-lg text-dsmuted"
                    >
                        <ChevronDown className="h-5 w-5" strokeWidth={2.4} />
                    </Button>
                )}
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
                    Completá el detalle de {motivoBloqueante.descripcion} en {bloqueado.descripcion} (ofrecimiento{' '}
                    {bloqueadoIndex + 1} de {ofrecimientos.length}).
                </p>
            )}
        </div>
    )
}
