import { useQuery } from '@tanstack/react-query'
import { getPropuesta } from '@/api/planificacion'
import type { IRubroPropuesta, IRubroRecommendation } from '@/types/planificacion'

// RubroRecommendationService compares current-month units against the
// client's own rubro minimum (rubroRatio), not a zone average — there's no
// clientUnits/zoneUnits pair to map, so the comparison UI is left to degrade
// gracefully (see IRubroPropuesta).
function toRubroPropuesta(r: IRubroRecommendation): IRubroPropuesta {
    return {
        nombre: r.rubroDescription,
        gapPct: Math.max(0, Math.round((1 - r.projection.rubroRatio) * 100)),
    }
}

export function usePropuesta(codigoCliente: string | null) {
    return useQuery({
        queryKey: ['propuesta', codigoCliente],
        queryFn: () => getPropuesta(codigoCliente as string),
        enabled: !!codigoCliente,
        select: data => ({
            rubros: (data.clients[0]?.rubros ?? []).map(toRubroPropuesta),
        }),
    })
}
