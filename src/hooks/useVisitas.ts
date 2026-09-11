import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
    cerrarVisita,
    iniciarVisita,
    registrarNoVisita,
    reintentarSeguimiento,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { ICerrarVisitaDTO, IIniciarVisitaDTO, INoVisitaDTO } from '@/types/planificacion'

function useMutacionDeVisita<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
    const qc = useQueryClient()
    return useMutation({
        // Envuelta (no pasada directo) para que solo las `variables` reales lleguen a la
        // función: React Query v5 llama a mutationFn con un segundo argumento de contexto,
        // que si no se filtraría en los toHaveBeenCalledWith de los tests.
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

export function useIniciarVisita() {
    return useMutacionDeVisita((dto: IIniciarVisitaDTO) => iniciarVisita(dto))
}

/** Sin motivoIds: el resultado comercial vive en los ofrecimientos. */
export function useCerrarVisita() {
    return useMutacionDeVisita((args: { visitaId: number } & ICerrarVisitaDTO) =>
        cerrarVisita(args.visitaId, {
            coordFinal: args.coordFinal,
            // Se OMITE la clave cuando no hay texto, en vez de mandar `null`: el body
            // queda idéntico al de antes de esta feature para el caso más común, así que
            // un backend viejo sin la columna sigue recibiendo exactamente lo que espera.
            ...(args.observaciones ? { observaciones: args.observaciones } : {}),
        }),
    )
}

export function useNoVisita() {
    return useMutacionDeVisita((dto: INoVisitaDTO) => registrarNoVisita(dto))
}

/** Reintento manual del aviso a Cromo desde la agenda (botón "Reintentar sincronización",
 *  visible cuando `seguimiento.estado === 'pendiente'`). Invalida la agenda igual que las
 *  otras mutaciones de visita: un reintento exitoso saca a la fila de `pendiente`, y la
 *  única forma de que el botón desaparezca es que la agenda se vuelva a leer. */
export function useReintentarSeguimiento() {
    return useMutacionDeVisita((resolucionId: number) => reintentarSeguimiento(resolucionId))
}
