import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cerrarVisita,
    getVisitaActiva,
    iniciarVisita,
    noVisitaSobreVisitaAbierta,
    registrarNoVisita,
    reintentarSeguimiento,
    volverMasTarde,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import { cupoKeys } from './useCupo'
import type {
    IAgendaClient,
    ICerrarVisitaDTO,
    IIniciarVisitaDTO,
    INoVisitaDTO,
    IPreviewCiclo,
    SemanaAgenda,
} from '@/types/planificacion'

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

function useMutacionDeVisita<TVars, TData>(
    fn: (vars: TVars) => Promise<TData>,
    alExito?: (vars: TVars) => void,
) {
    const qc = useQueryClient()
    return useMutation({
        // Envuelta (no pasada directo) para que solo las `variables` reales lleguen a la
        // función: React Query v5 llama a mutationFn con un segundo argumento de contexto,
        // que si no se filtraría en los toHaveBeenCalledWith de los tests.
        mutationFn: fn,
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            alExito?.(vars)
        },
    })
}

export function useIniciarVisita() {
    return useMutacionDeVisita((dto: IIniciarVisitaDTO) => iniciarVisita(dto))
}

/** Sin motivoIds: el resultado comercial vive en los ofrecimientos. */
export function useCerrarVisita() {
    const qc = useQueryClient()
    return useMutacionDeVisita(
        (args: { visitaId: number } & ICerrarVisitaDTO) =>
            cerrarVisita(args.visitaId, {
                coordFinal: args.coordFinal,
                // Se OMITE la clave cuando no hay texto, en vez de mandar `null`: el body
                // queda idéntico al de antes de esta feature para el caso más común, así que
                // un backend viejo sin la columna sigue recibiendo exactamente lo que espera.
                ...(args.observaciones ? { observaciones: args.observaciones } : {}),
                // Solo en visitas de alta: datos de contacto cargados al cerrar.
                ...(args.detalle ? { detalle: args.detalle } : {}),
                // Solo si aceptó el plan CUPO; mismo criterio de omitir la clave.
                ...(args.cupo ? { cupo: true as const } : {}),
            }),
        // Con la aceptación guardada el recuadro del cliente pasa a adherido.
        args => {
            if (args.cupo) qc.invalidateQueries({ queryKey: cupoKeys.todo })
        },
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

/**
 * "Volver más tarde": la visita abierta se descarta y la fila vuelve a `pendiente`. Además
 * de invalidar, la card se pasa a pendiente DIRECTO en la caché (mismo patrón y mismas dos
 * queries que useActualizarFicha): hasta que llegue el refetch seguiría diciendo `en_curso`
 * con el `visitaId` de una resolución que ya no existe, y tocarla reabriría los rubros de
 * esa visita (404) en vez de ofrecer "Iniciar visita".
 */
export function useVolverMasTarde() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { visitaId: number; coordCancelacion: string }) =>
            volverMasTarde(args.visitaId, args.coordCancelacion),
        onSuccess: ({ rotacionClienteId }) => {
            const aPendiente = (c: IAgendaClient): IAgendaClient =>
                c.rotacionClienteId === rotacionClienteId
                    ? { ...c, estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0 }
                    : c
            const porDia = <T extends Record<string, IAgendaClient[]>>(dias: T): T => {
                const out: Record<string, IAgendaClient[]> = { ...dias }
                for (const dia of Object.keys(dias)) out[dia] = dias[dia].map(aPendiente)
                return out as T
            }
            qc.setQueryData<SemanaAgenda>(agendaKeys.semana, semana => (semana ? porDia(semana) : semana))
            qc.setQueriesData<IPreviewCiclo>({ queryKey: cicloKeys.previewTodos }, prev =>
                prev ? { ...prev, dias: porDia(prev.dias) } : prev,
            )
        },
        // También ante un error: un 409 VISITA_NO_EN_CURSO dice que la agenda que se tiene
        // en mano está vieja.
        onSettled: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.previewTodos })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

/** Reintento manual del aviso a Cromo desde la agenda (botón "Reintentar sincronización",
 *  visible cuando `seguimiento.estado === 'pendiente'`). Invalida la agenda igual que las
 *  otras mutaciones de visita: un reintento exitoso saca a la fila de `pendiente`, y la
 *  única forma de que el botón desaparezca es que la agenda se vuelva a leer. */
export function useReintentarSeguimiento() {
    return useMutacionDeVisita((resolucionId: number) => reintentarSeguimiento(resolucionId))
}
