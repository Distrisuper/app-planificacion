import { apiClient } from './apiClient'
import { MOCK_CLIENTES, MOCK_METRICAS, MOCK_METRICAS_ANTERIOR, MOCK_METRICAS_EQUIPO } from '@/mocks/metricasMock'
import { mesActual } from '@/lib/metricas/mes'
import type { EstadoCliente, IMetricaCliente, IMetricas } from '@/types/metricas'

const USA_MOCK = import.meta.env.VITE_METRICAS_MOCK === '1'
const DELAY_MS = import.meta.env.DEV ? 250 : 0
const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

export interface IMetricasArgs {
    /** YYYY-MM */
    mes: string
    /** Ausente = yo (o mi vendedor de prueba). Código = ese vendedor (gerencia). 'equipo' = todo el scope. */
    vendedor?: string
}

export const getMetricas = async (args: IMetricasArgs): Promise<IMetricas> => {
    if (USA_MOCK) {
        await esperar()
        if (args.vendedor === 'equipo') return MOCK_METRICAS_EQUIPO
        return args.mes === mesActual() ? MOCK_METRICAS : MOCK_METRICAS_ANTERIOR
    }
    const res = await apiClient.get('/planificacion/metricas', { params: args })
    return res.data.data
}

export const getMetricasClientes = async (
    args: IMetricasArgs & { estado: EstadoCliente | 'caida' },
): Promise<IMetricaCliente[]> => {
    if (USA_MOCK) {
        await esperar()
        return MOCK_CLIENTES
    }
    const res = await apiClient.get('/planificacion/metricas/clientes', { params: args })
    return res.data.data
}
