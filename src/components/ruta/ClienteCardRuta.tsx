import { useDraggable } from '@dnd-kit/core'
import { titleCaseNombre } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { IAgendaClientAdmin } from '@/types/planificacion'

interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
    /** false = solo lectura (rotación cerrada, o fila ya resuelta). */
    arrastrable?: boolean
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
export default function ClienteCardRuta({ cliente, arrastrable }: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    // Una fila resuelta nunca es arrastrable: el backend la rechaza con FILA_RESUELTA, y
    // dejar arrastrarla sería ofrecer una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto

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
            className={`rounded-md border px-2 py-1.5 text-xs ${
                resuelto
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            } ${isDragging ? 'opacity-50' : ''} ${puedeMoverse ? 'cursor-grab' : ''}`}
        >
            <p className="font-medium leading-tight">
                {titleCaseNombre(cliente.nombreCliente)}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="text-[11px] text-slate-500">
                    {cliente.codigoParticularCliente}
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
