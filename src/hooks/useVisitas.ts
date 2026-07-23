import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'

export function useVisitaActiva() {
    // getVisitaActiva takes zero args, so passing it directly as queryFn is safe —
    // React Query's injected QueryFunctionContext argument is simply ignored (same
    // reasoning as getMotivos in useMotivos.ts).
    return useQuery({ queryKey: ['visita-activa'], queryFn: getVisitaActiva })
}

export function useIniciarVisita() {
    const qc = useQueryClient()
    return useMutation({
        // Wrapped (rather than passed directly) so only the real `variables` reach
        // iniciarVisita — React Query v5 calls mutationFn with a second
        // MutationFunctionContext argument, which would otherwise leak into any
        // assertion made against a mocked iniciarVisita in tests (see useNoVisita
        // below, and useVisitas.test.tsx's own toHaveBeenCalledWith assertion).
        mutationFn: (dto: Parameters<typeof iniciarVisita>[0]) => iniciarVisita(dto),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visita-activa'] }),
    })
}

export function useCerrarVisita() {
    const qc = useQueryClient()
    return useMutation({
        // cerrarVisita takes two args (visitaId, body); mutationFn only ever gets a
        // single variables argument, so it must be wrapped.
        mutationFn: (args: {
            visitaId: number
            coordFinal: string | null
            motivoIds: number[]
        }) => cerrarVisita(args.visitaId, { coordFinal: args.coordFinal, motivoIds: args.motivoIds }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visita-activa'] })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['agenda', 'dia'] })
        },
    })
}

export function useNoVisita() {
    const qc = useQueryClient()
    return useMutation({
        // Wrapped (rather than passed directly) so only the real `variables` reach
        // registrarNoVisita — React Query v5 calls mutationFn with a second
        // MutationFunctionContext argument, which would otherwise leak into any
        // assertion made against the mocked registrarNoVisita in tests.
        mutationFn: (body: Parameters<typeof registrarNoVisita>[0]) => registrarNoVisita(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['agenda', 'dia'] })
        },
    })
}
