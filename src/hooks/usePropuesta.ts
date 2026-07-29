import { useQuery } from '@tanstack/react-query'
import { getPropuesta } from '@/api/planificacion'
import type { IRubroPropuesta, IDroppedRubro } from '@/types/planificacion'

function toRubroPropuesta(r: IDroppedRubro): IRubroPropuesta {
    return {
        rubroCode: r.rubroCode,
        nombre: r.rubroDescription,
        pesosPerdidos: r.pesosPerdidos,
        caidaPct: r.current.dropPct,
        isFallback: r.isFallback,
        reason: r.reason,
        current: r.current,
        prev: r.prev,
    }
}

export function usePropuesta(codigoCliente: string | null) {
    return useQuery({
        queryKey: ['propuesta', codigoCliente],
        queryFn: () => getPropuesta(codigoCliente as string),
        enabled: !!codigoCliente,
        select: data => ({
            rubros: (data.rubros ?? []).map(toRubroPropuesta),
        }),
    })
}
