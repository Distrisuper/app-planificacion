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
    /** Cierra el wizard y vuelve al resumen. El cambio ya vive en `borradores` (se
     *  actualiza en cada tilde vía onCambiarBorrador), así que acá no hay nada que
     *  guardar ni ningún estado de carga. */
    onFinalizar: () => void
}

/** Atrás / minimizar / Siguiente-o-"Ver resumen". Se renderiza en el pie FIJO del sheet (fuera
 *  del área de scroll) para que siga a la vista aunque el detalle de un motivo (ej. Precio)
 *  empuje el contenido hacia abajo — si viviera en el scroll, expandir el detalle lo tapa.
 *
 *  El texto de "qué falta" NO vive acá: vivir en el pie fijo lo hacía crecer y encoger según
 *  hubiera o no un motivo bloqueante, empujando estos mismos botones cada vez que aparecía o
 *  desaparecía. Vive junto al campo que falta (ver ResolucionOfrecimiento), donde además es
 *  más accionable: el vendedor ya está mirando ahí. */
export default function ResolucionWizardAcciones({
    ofrecimientos,
    index,
    motivos,
    borradores,
    onIndexChange,
    onFinalizar,
}: ResolucionWizardAccionesProps) {
    const esUltimo = index === ofrecimientos.length - 1

    // Se mira SOLO el rubro actual, no todos. Atajar el detalle a medias donde se está
    // cargando es lo que evita el cartel viejo ("completalo en Amortiguadores, ofrecimiento
    // 2 de 5"): un aviso que mandaba a arreglar algo tres pasos atrás, con el campo que
    // faltaba fuera de la pantalla. Acá el campo está a la vista, así que el bloqueo es
    // accionable en el lugar.
    const actual: IOfrecimiento | undefined = ofrecimientos[index]
    const motivoBloqueante: IMotivo | null = actual
        ? motivoIncompleto(motivos, borradores[actual.id] ?? [])
        : null

    return (
        <div className="flex items-center gap-2">
            {/* Atrás y Siguiente se bloquean con el detalle a medias: irse del rubro
             *  dejaría un motivo tildado sin los campos que el backend exige
             *  (MOTIVO_DETALLE_REQUERIDO), y el vendedor lo descubriría recién al
             *  querer cerrar la visita. La salida sí queda libre — ver más abajo. */}
            <Button
                variant="outline"
                disabled={index === 0 || !!motivoBloqueante}
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
             *  NO se deshabilita con el detalle a medias, a diferencia de Atrás y
             *  Siguiente: es la vía de escape de quien entró por error, y un escape
             *  deshabilitado deja al vendedor encerrado en un rubro que no quería
             *  abrir. Salir no rompe nada — el rubro queda con el chip en ámbar y
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
            {/* En el último paso NO va un botón verde de cierre: esto vuelve al
             *  resumen, igual que el ⌄ de los pasos anteriores. Se llamaba "Finalizar"
             *  y era verde, lo que prometía terminar la visita y solo minimizaba el
             *  wizard. El único que la termina es el naranja del resumen, y ese cierre
             *  es inmediato e irreversible (captura ubicación y escribe pl_resolucion,
             *  que no se reabre) — por eso no se duplica acá, donde caería justo en el
             *  slot que el vendedor viene tocando cinco veces seguidas. */}
            {esUltimo ? (
                <Button
                    variant="outline"
                    onClick={onFinalizar}
                    className="h-12 flex-1 text-[13.5px] font-bold"
                >
                    Ver resumen
                </Button>
            ) : (
                <Button
                    variant="outline"
                    disabled={!!motivoBloqueante}
                    onClick={() => onIndexChange(index + 1)}
                    className="h-12 flex-1 text-[13.5px] font-bold"
                >
                    Siguiente
                    <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
            )}
        </div>
    )
}
