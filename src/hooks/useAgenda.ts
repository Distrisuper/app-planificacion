import { useQuery } from '@tanstack/react-query'
import { getAgendaSemana, getAgendaDia } from '@/api/planificacion'

export const agendaKeys = {
    semana: ['agenda', 'semana'] as const,
    dia: (dia: string, fecha: string) => ['agenda', 'dia', dia, fecha] as const,
}

export function useAgendaSemana() {
    return useQuery({
        queryKey: agendaKeys.semana,
        // Wrapped (not passed directly) so React Query's QueryFunctionContext isn't
        // forwarded as the optional `semana` argument of getAgendaSemana.
        queryFn: () => getAgendaSemana(),
    })
}

export function useAgendaDia(dia: string, fecha: string, enabled = true) {
    return useQuery({
        queryKey: agendaKeys.dia(dia, fecha),
        queryFn: () => getAgendaDia(dia, fecha),
        enabled,
    })
}
