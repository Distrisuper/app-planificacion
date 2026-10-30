import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    armarSemana,
    getCicloActual,
    getSemanaCalendario,
    previewSemana,
    reacomodar,
    sincronizar,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IReacomodarDTO } from '@/types/planificacion'

export const cicloKeys = {
    actual: ['ciclo', 'actual'] as const,
    preview: (semana: number | undefined) => ['ciclo', 'preview', semana] as const,
    /** Una semana de calendario. Bajo el prefijo de los previews a propósito: los hooks que
     *  parchean o invalidan `previewTodos` (visitas, ficha, reacomodar…) la cubren sin
     *  saber que existe — la respuesta también trae `dias`. */
    calendario: (fechaLunes: string | undefined) => ['ciclo', 'preview', 'calendario', fechaLunes] as const,
    /** Prefijo de TODOS los previews, sin importar la semana: para parchear o invalidar en
     *  bloque cuando no se sabe cuál está montado. */
    previewTodos: ['ciclo', 'preview'] as const,
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

export function useSemanaCalendario(fechaLunes: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: cicloKeys.calendario(fechaLunes),
        queryFn: () => getSemanaCalendario(fechaLunes as string),
        enabled: enabled && fechaLunes !== undefined,
    })
}

/** Le da a la semana su copia propia antes de la primera escritura. Deja la respuesta (con
 *  los ids) en la caché de esa semana e invalida `ciclo/actual`, que trae `armada`. */
export function useArmarSemana() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (fechaLunes: string) => armarSemana(fechaLunes),
        onSuccess: semana => {
            qc.setQueryData(cicloKeys.calendario(semana.fechaLunes), semana)
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
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
        mutationFn: ({ rotacionClienteId, ...dto }: { rotacionClienteId: number } & IReacomodarDTO) =>
            reacomodar(rotacionClienteId, dto),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}
