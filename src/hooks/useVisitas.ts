import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cerrarVisita,
    getVisitaActiva,
    iniciarVisita,
    noVisitaSobreVisitaAbierta,
    registrarNoVisita,
    reintentarSeguimiento,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { ICerrarVisitaDTO, IIniciarVisitaDTO, INoVisitaDTO } from '@/types/planificacion'

/**
 * La visita abierta según el servidor. La key lleva el `visitaId`: una visita nueva no
 * puede leer la activa cacheada de la anterior, y lo que se usa de ella (`fechaInicio`,
 * `coordCliente`) no cambia mientras está abierta, así que no hace falta volver a pedirla.
 * La comparten el cronómetro y la página (misma key → un solo request).
 */
export function useVisitaActiva(visitaId: number | null) {
    return useQuery({
        queryKey: ['visitas', 'activa', visitaId],
        queryFn: async () => (await getVisitaActiva()) ?? null,
        staleTime: Infinity,
        enabled: visitaId !== null,
    })
}

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
            // Solo en visitas de alta: datos de contacto cargados al cerrar.
            ...(args.detalle ? { detalle: args.detalle } : {}),
        }),
    )
}

export function useNoVisita() {
    return useMutacionDeVisita((dto: INoVisitaDTO) => registrarNoVisita(dto))
}

/** Ver noVisitaSobreVisitaAbierta: mismo hecho que useNoVisita, otra puerta — acá la fila
 *  ya tiene una resolución abierta y lo que se hace es convertirla. */
export function useNoVisitaSobreVisitaAbierta() {
    return useMutacionDeVisita((args: { visitaId: number; motivoIds: number[] }) =>
        noVisitaSobreVisitaAbierta(args.visitaId, args.motivoIds),
    )
}

/** Reintento manual del aviso a Cromo desde la agenda (botón "Reintentar sincronización",
 *  visible cuando `seguimiento.estado === 'pendiente'`). Invalida la agenda igual que las
 *  otras mutaciones de visita: un reintento exitoso saca a la fila de `pendiente`, y la
 *  única forma de que el botón desaparezca es que la agenda se vuelva a leer. */
export function useReintentarSeguimiento() {
    return useMutacionDeVisita((resolucionId: number) => reintentarSeguimiento(resolucionId))
}
