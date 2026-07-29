import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    abrirCiclo,
    cerrarCiclo,
    getCicloActual,
    getCicloPreview,
    reagendarCicloCliente,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'

export const cicloKeys = {
    actual: ['ciclo', 'actual'] as const,
    preview: (semana: number | undefined) => ['ciclo', 'preview', semana ?? 'propuesta'] as const,
}

export function useCicloActual() {
    // getCicloActual no toma argumentos, así que pasarla directo como queryFn es seguro:
    // React Query le inyecta un QueryFunctionContext que la función ignora.
    return useQuery({ queryKey: cicloKeys.actual, queryFn: getCicloActual })
}

/** El plan de una semana sin abrirla. `enabled` en false mientras no se sepa qué mostrar. */
export function useCicloPreview(semana: number | undefined, enabled: boolean) {
    return useQuery({
        queryKey: cicloKeys.preview(semana),
        queryFn: () => getCicloPreview(semana),
        enabled,
    })
}

/** Abrir CONGELA el plan y no hay endpoint para descartarlo: invalidar todo lo que
 *  dependa de la vuelta para que nada quede mostrando el estado previo. */
export function useAbrirCiclo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (semana?: number) => abrirCiclo(semana),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export function useCerrarCiclo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => cerrarCiclo(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export function useReagendar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { cicloClienteId: number; dia: number }) =>
            reagendarCicloCliente(args.cicloClienteId, args.dia),
        onSuccess: () => qc.invalidateQueries({ queryKey: agendaKeys.semana }),
    })
}
