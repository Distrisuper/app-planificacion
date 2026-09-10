import { useDraggable } from '@dnd-kit/core'
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
}

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
}: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    // Una fila resuelta o ya eliminada nunca es arrastrable: el backend rechaza mover
    // cualquiera de las dos (FILA_RESUELTA, y una eliminada ni siquiera aparece para
    // `mover`/`findById`), y dejarla arrastrable ofrecería una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto && !cliente.eliminado

    // Estricto por 'pendiente' y no por !resuelto: 'en_curso' NO cuenta como resuelto,
    // pero el backend igual rechaza quitarla con 409 VISITA_EN_CURSO. Mostrar el botón
    // ahí ofrecería una acción que siempre falla. `!cliente.eliminado` porque una fila ya
    // quitada no se puede volver a quitar — ahí se ofrece "Restaurar" en su lugar.
    const puedeQuitarse =
        onQuitar !== undefined && cliente.estado === 'pendiente' && !cliente.eliminado
    const puedeRestaurarse = onRestaurar !== undefined && cliente.eliminado

    const confirmarQuitar = () => {
        const ok = window.confirm(
            `¿Quitar a ${titleCaseNombre(cliente.nombreCliente)} de esta vuelta? Vuelve a aparecer en la próxima rotación.`,
        )
        if (ok) onQuitar!(cliente.rotacionClienteId)
    }

    // Restaurar no pide confirmación: es la acción de "deshacer", no una destructiva —
    // pedirle al usuario que confirme un undo es fricción sin beneficio.
    const restaurar = () => onRestaurar!(cliente.rotacionClienteId)

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `card-${cliente.rotacionClienteId}`,
        disabled: !puedeMoverse,
    })

    return (
        <div
            ref={setNodeRef}
            {...(puedeMoverse ? { ...listeners, ...attributes } : {})}
            style={
                transform
                    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
                    : undefined
            }
            data-testid={`card-cliente-${cliente.rotacionClienteId}`}
            // Una fila ya resuelta no se puede mover: el backend la rechaza con
            // FILA_RESUELTA. Se marca en el DOM para que el grid la excluya del drag.
            data-resuelto={resuelto ? 'true' : 'false'}
            // Igual criterio para una fila quitada de esta rotación.
            data-eliminado={cliente.eliminado ? 'true' : 'false'}
            className={`relative rounded-md border px-2 py-1.5 text-xs ${
                resuelto || cliente.eliminado
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            } ${isDragging ? 'opacity-50' : ''} ${puedeMoverse ? 'cursor-grab' : ''}`}
        >
            {puedeQuitarse && (
                <button
                    type="button"
                    aria-label={`Quitar de esta vuelta: ${titleCaseNombre(cliente.nombreCliente)}`}
                    onClick={confirmarQuitar}
                    // El botón vive DENTRO del div arrastrable: sin cortar la propagación,
                    // el pointerdown burbujea hasta los listeners de dnd-kit (enganchados en
                    // el div) y lo que arranca es un drag, no el click — el puntero queda
                    // capturado por el sensor y confirmarQuitar() nunca se ejecuta.
                    onPointerDown={e => e.stopPropagation()}
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
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute right-1 top-1 rounded px-1 text-[11px] font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                >
                    Restaurar
                </button>
            )}
            <p className="font-medium leading-tight pr-4">
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
                    <span
                        title={autoria}
                        aria-label={autoria}
                        className="cursor-help text-[11px] text-slate-400"
                    >
                        ✎
                    </span>
                )}
            </div>
        </div>
    )
}
