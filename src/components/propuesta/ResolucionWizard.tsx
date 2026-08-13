import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import { useBrandCatalog } from '@/hooks/useCatalogos'
import { useEliminarOfrecimiento } from '@/hooks/useOfrecimientos'
import { tieneDetalleIncompleto } from '@/lib/resolucionOfrecimiento'
import type { IMotivo, IOfrecimiento, IOfrecimientoMotivo } from '@/types/planificacion'

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
    onVolver,
}: ResolucionWizardProps) {
    const ofrecimiento = ofrecimientos[index]

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
    const necesitaMarcas = (borradores[ofrecimiento.id] ?? []).some(
        m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
    )
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(necesitaMarcas)

    const completos = ofrecimientos.filter(r => {
        const cargados = borradores[r.id] ?? []
        return cargados.length > 0 && !tieneDetalleIncompleto(motivos, cargados)
    }).length

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

                {/* Un segmento por ofrecimiento: verde el que ya tiene su resolución completa,
                 *  navy y más alto el que se está cargando, gris el que falta. "2 de 6" es
                 *  texto y solo dice dónde estás; esto dice además qué hiciste y cuánto
                 *  queda, que es lo que el vendedor no podía saber sin salir a la lista. */}
                <div
                    className="mt-2 flex h-1.5 items-center gap-1"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={ofrecimientos.length}
                    aria-valuenow={index + 1}
                    aria-label={`Rubro ${index + 1} de ${ofrecimientos.length}, ${completos} resueltos`}
                >
                    {ofrecimientos.map((r, i) => {
                        const cargados = borradores[r.id] ?? []
                        const completo =
                            cargados.length > 0 && !tieneDetalleIncompleto(motivos, cargados)
                        return (
                            <div
                                key={r.id}
                                className={`flex-1 rounded-full transition-all ${
                                    i === index ? 'h-1.5' : 'h-[3px]'
                                } ${
                                    completo
                                        ? 'bg-dsgreen'
                                        : i === index
                                          ? 'bg-dsnavy'
                                          : 'bg-[#E4E8F0]'
                                }`}
                            />
                        )
                    })}
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
                    value={borradores[ofrecimiento.id] ?? []}
                    onChange={m => onCambiarBorrador(ofrecimiento.id, m)}
                />
            </div>
        </div>
    )
}
