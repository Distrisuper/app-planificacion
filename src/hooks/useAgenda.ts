import { useQuery } from '@tanstack/react-query'
import { getAgendaSemana, getAgendaDia } from '@/api/planificacion'
import type { Dia } from '@/types/planificacion'

export const agendaKeys = {
    semana: ['agenda', 'semana'] as const,
    dia: (dia: string) => ['agenda', 'dia', dia] as const,
}

/**
 * `enabled` sale de tener una vuelta abierta. Sin ella el endpoint responde
 * 409 CICLO_NO_ABIERTO, y ramificar la pantalla sobre un error HTTP sería frágil:
 * GET /ciclo/actual ya devuelve null, así que se sabe ANTES de preguntar.
 */
export function useAgendaSemana(enabled: boolean) {
    return useQuery({
        queryKey: agendaKeys.semana,
        queryFn: getAgendaSemana,
        enabled,
    })
}

export function useAgendaDia(dia: Dia, enabled = true) {
    return useQuery({
        queryKey: agendaKeys.dia(dia),
        queryFn: () => getAgendaDia(dia),
        enabled,
    })
}
