import { useQuery } from '@tanstack/react-query'
import { getPropuesta } from '@/api/planificacion'
import type { IRubroPropuesta, IDroppedRubro } from '@/types/planificacion'

function toRubroPropuesta(r: IDroppedRubro): IRubroPropuesta {
    return {
        rubroCode: r.rubroCode,
        nombre: r.rubroDescription,
        pesosPerdidos: r.pesosPerdidos,
        // Optional chaining, no `r.current.dropPct`: esta función corre dentro del `select`
        // de React Query, así que cualquier excepción acá deja la query en isError CON un
        // 200 en la red — y el flujo de "Iniciar visita" moría en un spinner infinito
        // (data quedaba undefined para siempre). Un campo de display que falta no puede
        // tumbar la visita; `caidaPct` ya es nullable en todo el camino de abajo.
        caidaPct: r.current?.dropPct ?? null,
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
            daysElapsed: data.daysElapsed,
            totalDays: data.totalDays,
        }),
    })
}
