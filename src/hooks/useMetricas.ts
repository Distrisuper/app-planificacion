import { useQuery } from '@tanstack/react-query'
import { getMetricas, getMetricasClientes, type IMetricasArgs } from '@/api/metricas'
import type { EstadoCliente } from '@/types/metricas'

type ClientesArgs = IMetricasArgs & { estado: EstadoCliente | 'caida' }

/** Keys sin usuario a propósito, como agenda y ciclo: `cerrarSesionLocal` vacía toda la
 *  caché, así que el siguiente usuario del teléfono no ve las métricas del anterior. */
export const metricasKeys = {
    metricas: (a: IMetricasArgs) => ['metricas', a.mes, a.vendedor ?? 'yo'] as const,
    clientes: (a: ClientesArgs) => ['metricas', 'clientes', a.mes, a.vendedor ?? 'yo', a.estado] as const,
}

export function useMetricas(args: IMetricasArgs) {
    return useQuery({ queryKey: metricasKeys.metricas(args), queryFn: () => getMetricas(args), staleTime: 5 * 60 * 1000 })
}

export function useMetricasClientes(args: ClientesArgs, opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: metricasKeys.clientes(args),
        queryFn: () => getMetricasClientes(args),
        enabled: opts?.enabled ?? true,
    })
}
