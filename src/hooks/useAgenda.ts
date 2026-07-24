import { useQuery } from '@tanstack/react-query'
import { getAgendaSemana, getAgendaDia } from '@/api/planificacion'
import { withMockVisualData } from '@/lib/mockAgendaData'
import type { Dia, SemanaAgenda } from '@/types/planificacion'

export const agendaKeys = {
    semana: ['agenda', 'semana'] as const,
    dia: (dia: string, fecha: string) => ['agenda', 'dia', dia, fecha] as const,
}

export function useAgendaSemana() {
    return useQuery({
        queryKey: agendaKeys.semana,
        // Wrapped (not passed directly) so React Query's QueryFunctionContext isn't
        // forwarded as the optional `semana` argument of getAgendaSemana.
        queryFn: async () => {
            const semana = await getAgendaSemana()
            const out = {} as SemanaAgenda
            for (const dia of Object.keys(semana) as Dia[]) {
                out[dia] = semana[dia].map(withMockVisualData)
            }
            return out
        },
    })
}

export function useAgendaDia(dia: string, fecha: string, enabled = true) {
    return useQuery({
        queryKey: agendaKeys.dia(dia, fecha),
        queryFn: async () => (await getAgendaDia(dia, fecha)).map(withMockVisualData),
        enabled,
    })
}
