import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCicloActual, previewSemana, reacomodar, sincronizar } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IReacomodarDTO } from '@/types/planificacion'

export const cicloKeys = {
    actual: ['ciclo', 'actual'] as const,
    preview: (semana: number | undefined) => ['ciclo', 'preview', semana] as const,
}

export function useCicloActual() {
    return useQuery({ queryKey: cicloKeys.actual, queryFn: getCicloActual })
}

export function usePreviewSemana(semana: number | undefined, enabled: boolean) {
    return useQuery({
        queryKey: cicloKeys.preview(semana),
        queryFn: () => previewSemana(semana as number),
        enabled: enabled && semana !== undefined,
    })
}

/** Idempotente: se llama al montar la página y al volver de background, nunca por acción del
 *  usuario. Invalida ciclo/agenda/preview porque puede haber cerrado una semana y cambiado el
 *  padrón. */
export function useSincronizar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: sincronizar,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
        },
    })
}

export function useReacomodar() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionClienteId: number } & IReacomodarDTO) =>
            reacomodar(args.rotacionClienteId, { semana: args.semana, dia: args.dia }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}
