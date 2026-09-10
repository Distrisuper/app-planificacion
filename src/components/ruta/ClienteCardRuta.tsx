import { useDraggable } from '@dnd-kit/core'
import { memo, useCallback, useState } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { titleCaseNombre } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { IAgendaClientAdmin } from '@/types/planificacion'

interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
    /** false = solo lectura (rotación cerrada, o fila ya resuelta/eliminada). */
    arrastrable?: boolean
    /** Ausente = no se ofrece quitar (ej. dentro de ColaRotaciones, o rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar. Solo tiene efecto si `cliente.eliminado` es true. */
    onRestaurar?: (rotacionClienteId: number) => void
    /**
     * Esta es la copia que sigue al cursor dentro del `DragOverlay`, no la card real:
     * no arrastra (la original ya lo está haciendo) y no ofrece acciones.
     */
    overlay?: boolean
}

interface CuerpoProps {
    cliente: IAgendaClientAdmin
    puedeQuitarse: boolean
    puedeRestaurarse: boolean
    abrirQuitar: () => void
    restaurar: () => void
}

/**
 * El contenido visual de la card, separado y memoizado.
 *
 * No es cosmético: `useDraggable` consume el contexto de dnd-kit, así que las ~150 cards
 * de la grilla se re-renderizan en CADA cambio de estado del arrastre, y el umbral de
 * activación agrega una vuelta más (el estado "pendiente" de dnd-kit). Con el JSX acá
 * adentro y props estables, React descarta ese re-render y solo rehace el div de afuera
 * —el único que depende de `isDragging`—.
 *
 * Medido con 150 cards, tarea bloqueante al agarrar una card (dev): 253ms → 110ms al
 * dejar de montar 150 `AlertDialog.Root` cerrados, y 110ms → 82ms con este memo. En build
 * de producción no queda ningún longtask y el feedback llega ~44ms después de cruzar el
 * umbral. El número de dev es el que se siente al desarrollar; el de producción es el
 * real, y conviene no volver a optimizar mirando solo el primero.
 *
 * Para que el memo sirva, `abrirQuitar` y `restaurar` tienen que ser estables: van con
 * `useCallback` en el componente de arriba.
 */
const Cuerpo = memo(function Cuerpo({
    cliente,
    puedeQuitarse,
    puedeRestaurarse,
    abrirQuitar,
    restaurar,
}: CuerpoProps) {
    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    return (
        <>
            {/* El texto NO recibe eventos de puntero: así el arrastre se puede empezar
                desde el nombre del cliente, que es de donde uno lo agarra naturalmente —
                los eventos lo atraviesan hasta la superficie de arrastre de abajo.
                `relative` para pintarse por encima de esa superficie, que es absoluta. */}
            <div className="pointer-events-none relative">
                {/* El padding derecho deja lugar al botón de la esquina. "Restaurar" es
                    una palabra, no un ícono: con `pr-4` (lo que necesita el ✕) el nombre
                    del cliente le pasaba por debajo en una columna de ~147px. */}
                <p
                    className={`font-medium leading-tight ${
                        puedeRestaurarse ? 'pr-16' : 'pr-4'
                    }`}
                >
                    {titleCaseNombre(cliente.nombreCliente)}
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        {cliente.codigoParticularCliente}
                        {cliente.esExtra && (
                            <span className="inline-flex items-center rounded-full bg-[#E0E7FF] px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#3730A3]">
                                Agregado
                            </span>
                        )}
                        {cliente.eliminado && (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-red-700">
                                Quitado
                            </span>
                        )}
                    </span>
                    {autoria && (
                        // Recupera los eventos de puntero porque su `title` es un tooltip:
                        // sin esto no se puede hover y la autoría del movimiento no se lee.
                        <span
                            title={autoria}
                            aria-label={autoria}
                            className="pointer-events-auto cursor-help text-[11px] text-slate-400"
                        >
                            ✎
                        </span>
                    )}
                </div>
            </div>

            {puedeQuitarse && (
                <button
                    type="button"
                    aria-label={`Quitar de esta vuelta: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={abrirQuitar}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                    ✕
                </button>
            )}
            {puedeRestaurarse && (
                <button
                    type="button"
                    aria-label={`Restaurar: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={restaurar}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                >
                    Restaurar
                </button>
            )}
        </>
    )
})

/**
 * La card del grid de gerencia.
 *
 * NO reusa `ClienteCard` (la de la agenda del vendedor) a propósito: esa exige cuatro
 * callbacks del ciclo de la visita —`onAbrir`, `onEstadoVisita`, `onIniciarVisita`,
 * `onAbrirAppExterna`— que acá no significan nada. Gerencia no inicia visitas ni abre
 * Versus: mueve clientes de casillero. Pasarle handlers vacíos para reusarla habría dejado
 * botones muertos en pantalla.
 */
export default function ClienteCardRuta({
    cliente,
    arrastrable,
    onQuitar,
    onRestaurar,
    overlay,
}: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    // Una fila resuelta o ya eliminada nunca es arrastrable: el backend rechaza mover
    // cualquiera de las dos (FILA_RESUELTA, y una eliminada ni siquiera aparece para
    // `mover`/`findById`), y dejarla arrastrable ofrecería una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto && !cliente.eliminado

    // Estricto por 'pendiente' y no por !resuelto: 'en_curso' NO cuenta como resuelto,
    // pero el backend igual rechaza quitarla con 409 VISITA_EN_CURSO. Mostrar el botón
    // ahí ofrecería una acción que siempre falla. `!cliente.eliminado` porque una fila ya
    // quitada no se puede volver a quitar — ahí se ofrece "Restaurar" en su lugar.
    const puedeQuitarse =
        !overlay && onQuitar !== undefined && cliente.estado === 'pendiente' && !cliente.eliminado
    const puedeRestaurarse = !overlay && onRestaurar !== undefined && cliente.eliminado

    const [confirmandoQuitar, setConfirmandoQuitar] = useState(false)
    const abrirQuitar = useCallback(() => setConfirmandoQuitar(true), [])

    // Si la fila deja de poder quitarse con el diálogo abierto (un refetch en segundo
    // plano la trae ya `eliminado` porque otro la quitó), el diálogo desaparece pero el
    // estado quedaría en `true`: al restaurarla, se abriría solo. Se reajusta en el
    // render, que es lo que React recomienda para estado derivado de props.
    if (confirmandoQuitar && !puedeQuitarse) setConfirmandoQuitar(false)

    // Restaurar no pide confirmación: es la acción de "deshacer", no una destructiva —
    // pedirle al usuario que confirme un undo es fricción sin beneficio.
    const restaurar = useCallback(
        () => onRestaurar?.(cliente.rotacionClienteId),
        [onRestaurar, cliente.rotacionClienteId],
    )

    // La copia del overlay usa OTRO id a propósito: dos `useDraggable` con el mismo id
    // se pisan en el registro de dnd-kit y la card real pierde su medición a mitad del
    // arrastre. Va deshabilitada porque nunca se arrastra a sí misma.
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: overlay
            ? `overlay-${cliente.rotacionClienteId}`
            : `card-${cliente.rotacionClienteId}`,
        disabled: overlay || !puedeMoverse,
    })

    return (
        <div
            // La copia del overlay lleva otro testid: dos nodos con el mismo dejarían las
            // consultas ambiguas justo durante el arrastre.
            data-testid={
                overlay
                    ? `overlay-cliente-${cliente.rotacionClienteId}`
                    : `card-cliente-${cliente.rotacionClienteId}`
            }
            // Una fila ya resuelta no se puede mover: el backend la rechaza con
            // FILA_RESUELTA. Se marca en el DOM para que el grid la excluya del drag.
            data-resuelto={resuelto ? 'true' : 'false'}
            // Igual criterio para una fila quitada de esta rotación.
            data-eliminado={cliente.eliminado ? 'true' : 'false'}
            // `select-none`: sin él, arrastrar desde el nombre del cliente pinta la
            // selección de texto de la fila entera.
            className={`relative select-none rounded-md border px-2 py-1.5 text-xs ${
                resuelto || cliente.eliminado
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            } ${isDragging ? 'opacity-40' : ''} ${
                overlay ? 'cursor-grabbing shadow-lg ring-1 ring-slate-400' : ''
            } ${
                // El `active:` es CSS puro, así que responde en el mismo instante en que
                // se aprieta —cero JS— y tapa los ~2 frames que el arrastre tarda en
                // levantar la card por el umbral de activación. Sin esto, apretar y
                // todavía no ver nada se siente trabado.
                puedeMoverse && !overlay
                    ? 'cursor-grab active:cursor-grabbing active:ring-1 active:ring-slate-400'
                    : ''
            }`}
        >
            {/* LA SUPERFICIE DE ARRASTRE: el único nodo con los listeners de dnd-kit, y
                deliberadamente vacío. Los botones y el diálogo son HERMANOS suyos, no
                descendientes, así que sus eventos no pueden llegar al sensor y arrancar un
                arrastre en lugar del click.

                Antes los listeners vivían en el div de afuera y los botones se defendían
                con `stopPropagation` del `pointerdown`. Eso se rompió solo al cambiar los
                sensores: `MouseSensor`/`TouchSensor` escuchan `onMouseDown`/`onTouchStart`,
                no `onPointerDown` (ver `activators` en @dnd-kit/core), así que la guarda
                dejó de guardar sin que nada fallara a la vista. Y cuando el arrastre
                arranca, dnd-kit agrega un `click` con `stopPropagation` en capture sobre el
                document: el click del botón se pierde y el botón parece muerto.

                Con la superficie aparte, la protección no depende de qué evento use el
                sensor configurado. */}
            {puedeMoverse && !overlay && (
                <div
                    ref={setNodeRef}
                    {...listeners}
                    {...attributes}
                    // dnd-kit la expone como `role="button"` tabbable para el arrastre por
                    // teclado. Al estar vacía necesita nombre propio: antes lo heredaba del
                    // texto de la card.
                    aria-label={`Mover ${titleCaseNombre(cliente.nombreCliente)}`}
                    className="absolute inset-0 rounded-md"
                />
            )}

            <Cuerpo
                cliente={cliente}
                puedeQuitarse={puedeQuitarse}
                puedeRestaurarse={puedeRestaurarse}
                abrirQuitar={abrirQuitar}
                restaurar={restaurar}
            />

            {/* Se monta recién al abrirse, no junto con la card: son ~150 cards en la
                grilla y cada `AlertDialog.Root` cerrado igual cuesta su árbol de
                componentes en cada re-render del arrastre. */}
            {puedeQuitarse && confirmandoQuitar && (
                <ConfirmDialog
                    open
                    onOpenChange={setConfirmandoQuitar}
                    title={`¿Quitar a ${titleCaseNombre(cliente.nombreCliente)} de esta vuelta?`}
                    description="Vuelve a aparecer en la próxima rotación."
                    confirmLabel="Quitar"
                    destructivo
                    onConfirm={() => onQuitar!(cliente.rotacionClienteId)}
                />
            )}
        </div>
    )
}
