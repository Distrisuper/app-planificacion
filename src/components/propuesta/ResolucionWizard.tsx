import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Eraser, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { useEliminarOfrecimiento } from '@/hooks/useOfrecimientos'
import type { IAccionComercial, IMotivo, IOfrecimiento, IOfrecimientoMotivo } from '@/types/planificacion'

interface ResolucionWizardProps {
    visitaId: number
    /** Subconjunto fijo de ofrecimientos que se está recorriendo (ya filtrado por el llamador). */
    ofrecimientos: IOfrecimiento[]
    /** Posición actual dentro de `ofrecimientos`. */
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por ofrecimientoId — lo que el vendedor tildó, guardado o no. */
    borradores: Record<number, IOfrecimientoMotivo[]>
    onCambiarBorrador: (ofrecimientoId: number, motivos: IOfrecimientoMotivo[]) => void
    /** Acción comercial por ofrecimientoId — borrador paralelo al de motivos. */
    detalles: Record<number, IAccionComercial | null>
    onCambiarAccion: (ofrecimientoId: number, accion: IAccionComercial | null) => void
    onVolver: () => void
}

/** Header (contexto/salida) + checklist del ofrecimiento actual. Va en el área scrolleable
 *  del sheet — la navegación y el guardado en lote viven en ResolucionWizardAcciones, que
 *  se renderiza aparte, en el pie fijo, para que no se oculten al expandirse el detalle. */
export default function ResolucionWizard({
    visitaId,
    ofrecimientos,
    index,
    motivos,
    borradores,
    onCambiarBorrador,
    detalles,
    onCambiarAccion,
    onVolver,
}: ResolucionWizardProps) {
    const ofrecimiento = ofrecimientos[index]
    const accion = detalles[ofrecimiento.id] ?? null

    // Sentido del último movimiento, para que la entrada acompañe a la navegación. Se lee
    // en el render (no en el efecto) porque la clase tiene que salir en el MISMO render en
    // que cambia el índice; el efecto solo deja el ref listo para la próxima.
    const indexAnterior = useRef(index)
    const haciaAdelante = index >= indexAnterior.current
    useEffect(() => {
        indexAnterior.current = index
    }, [index])

    // El catálogo de marcas se pide desde acá y no desde ResolucionOfrecimiento: el wizard
    // es el ancestro más cercano que ve a la vez el catálogo de motivos y el borrador, así
    // que puede pedirlo SOLO cuando hace falta — y deja a ResolucionOfrecimiento
    // presentacional puro, sin React Query en su test.
    const necesitaMarcas =
        accion !== null ||
        (borradores[ofrecimiento.id] ?? []).some(
            m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
        )
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(necesitaMarcas)

    // Replica SOLO acción o SOLO marca del rubro actual al resto — nunca juntas y nunca
    // la resolución: qué pasó con cada rubro es suyo, y la evidencia de seguimientos
    // muestra que el desenlace puede variar rubro a rubro aunque la acción sea la misma
    // (un cupo se acepta pero un kit puntual se rechaza). Cada check copia SU campo sin
    // tocar el otro que ya tuviera cargado ese rubro — es una copia de una sola vez, no
    // un vínculo: cada rubro sigue editable después.
    const restantes = ofrecimientos.filter((_, i) => i !== index)

    function aplicarMarca() {
        for (const r of restantes) {
            const actual = detalles[r.id] ?? null
            onCambiarAccion(r.id, {
                accion: actual?.accion ?? null,
                marca: accion?.marca ?? null,
                params: actual?.params,
            })
        }
    }

    // Limpia SOLO el borrador en pantalla de este rubro (acción + marca + motivos) — no
    // toca el backend ni los demás rubros. Vuelve a "sin nada cargado", como si recién
    // se hubiera entrado a resolverlo.
    const hayAlgoQueLimpiar = accion !== null || (borradores[ofrecimiento.id]?.length ?? 0) > 0
    function limpiarBorrador() {
        onCambiarAccion(ofrecimiento.id, null)
        onCambiarBorrador(ofrecimiento.id, [])
    }

    const eliminar = useEliminarOfrecimiento(visitaId)
    const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

    // Los ofrecimientos de la propuesta NO se borran (el backend responde
    // OFRECIMIENTO_DE_PROPUESTA): si no se ofreció, se resuelve con "No lo ofrecí". Poner
    // el borrado detrás del wizard (y no al lado del target grande de la fila en la tabla)
    // evita el borrado accidental.
    async function quitarOfrecimiento() {
        setErrorEliminar(null)
        try {
            await eliminar.mutateAsync(ofrecimiento.id)
            onVolver()
        } catch {
            setErrorEliminar('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        }
    }

    return (
        <div>
            {/* Sticky: el nombre del ofrecimiento es la info que más importa en esta
             *  pantalla — si scrollea con el resto (ej. al expandirse el detalle de
             *  Precio), el vendedor pierde de vista cuál está resolviendo a mitad de la
             *  lista. El -mx/px negativo hace que el fondo llegue a los bordes del sheet
             *  en vez de dejar ver el contenido de abajo por el padding lateral del
             *  scroll. */}
            <div className="sticky top-0 z-10 -mx-[18px] mb-3 border-b border-[#EEF0F5] bg-white px-[18px] pb-2.5">
                <div className="flex items-center gap-2">
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
                    {ofrecimiento.descripcion}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-dsmuted">
                    {index + 1} de {ofrecimientos.length}
                </span>
                {hayAlgoQueLimpiar && (
                    <button
                        type="button"
                        aria-label="Limpiar lo cargado en este rubro"
                        onClick={limpiarBorrador}
                        className="shrink-0 text-dsmuted"
                    >
                        <Eraser className="h-4 w-4" strokeWidth={2} />
                    </button>
                )}
                {!ofrecimiento.esPropuesto && (
                    <button
                        type="button"
                        aria-label={`Quitar ${ofrecimiento.descripcion}`}
                        onClick={quitarOfrecimiento}
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
            </div>

            {errorEliminar && (
                <p className="mb-2.5 rounded-[10px] bg-[#FEECEC] px-3 py-2 text-[12.5px] font-semibold text-dsred">
                    {errorEliminar}
                </p>
            )}

            {/* `key` por ofrecimiento: sin él React reusa el mismo árbol al cambiar de
             *  índice y la animación no se vuelve a disparar (además de arrastrar el
             *  estado interno del ofrecimiento anterior). */}
            <div
                key={ofrecimiento.id}
                className={haciaAdelante ? 'animate-rubro-adelante' : 'animate-rubro-atras'}
            >
                <ResolucionOfrecimiento
                    motivos={motivos}
                    marcas={marcas}
                    marcasLoading={marcasLoading}
                    accion={accion}
                    onChangeAccion={a => onCambiarAccion(ofrecimiento.id, a)}
                    value={borradores[ofrecimiento.id] ?? []}
                    onChange={m => onCambiarBorrador(ofrecimiento.id, m)}
                    rubrosRestantes={restantes.length}
                    onAplicarMarca={aplicarMarca}
                />
            </div>
        </div>
    )
}
