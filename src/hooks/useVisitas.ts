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
        // iniciarVisita(dto) takes exactly one argument, matching what useMutation's
        // mutationFn receives (the variables passed to mutate()/mutateAsync() — React
        // Query v5 does NOT inject a context object into mutationFn the way it does
        // for queryFn), so passing it directly is safe.
        mutationFn: iniciarVisita,
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
        // registrarNoVisita(body) takes exactly one argument — safe to pass directly.
        mutationFn: registrarNoVisita,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['agenda', 'dia'] })
        },
    })
}
