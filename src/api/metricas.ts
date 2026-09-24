import { apiClient } from './apiClient'
import {
    MOCK_CATEGORIAS, MOCK_CLIENTES_TRAMO, MOCK_OBJECION_DETALLE, MOCK_OBJECIONES_METRICAS,
    MOCK_OPCIONES, MOCK_RESUMEN_METRICAS,
} from '@/mocks/metricasMock'
import type {
    ICategoriasMetricas, IClientesDeTramo, IFiltroMetricas, IMetricasResumen,
    IObjecionDetalle, IObjecionesMetricas, IOpcionesMetricas, Tramo,
} from '@/types/metricas'

const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'
const DELAY_MS = import.meta.env.DEV ? 250 : 0
const esperar = () => new Promise(r => setTimeout(r, DELAY_MS))

const BASE = '/planificacion/analitica/metricas'

export interface IArgsListado {
    pagina: number
    orden: string
    dir: 'asc' | 'desc'
}

export const getResumenMetricas = async (f: IFiltroMetricas): Promise<IMetricasResumen> => {
    if (USA_MOCK) { await esperar(); return { ...MOCK_RESUMEN_METRICAS, desde: f.desde, hasta: f.hasta } }
    return (await apiClient.get(`${BASE}/resumen`, { params: f })).data.data
}

export const getObjecionesMetricas = async (f: IFiltroMetricas, rubro?: string): Promise<IObjecionesMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_OBJECIONES_METRICAS }
    return (await apiClient.get(`${BASE}/objeciones`, { params: { ...f, rubro } })).data.data
}

export const getObjecionDetalle = async (
    f: IFiltroMetricas, motivoId: number, args: IArgsListado & { rubro?: string },
): Promise<IObjecionDetalle> => {
    if (USA_MOCK) { await esperar(); return { ...MOCK_OBJECION_DETALLE, motivoId } }
    return (await apiClient.get(`${BASE}/objeciones/${motivoId}`, { params: { ...f, ...args, cant: 8 } })).data.data
}

export const getCategoriasMetricas = async (f: IFiltroMetricas): Promise<ICategoriasMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_CATEGORIAS }
    return (await apiClient.get(`${BASE}/categorias`, { params: f })).data.data
}

export const getClientesDeTramo = async (f: IFiltroMetricas, tramo: Tramo, args: IArgsListado): Promise<IClientesDeTramo> => {
    if (USA_MOCK) { await esperar(); return MOCK_CLIENTES_TRAMO }
    return (await apiClient.get(`${BASE}/categorias/${tramo}/clientes`, { params: { ...f, ...args, cant: 8 } })).data.data
}

export const getOpcionesMetricas = async (hasta: string): Promise<IOpcionesMetricas> => {
    if (USA_MOCK) { await esperar(); return MOCK_OPCIONES }
    return (await apiClient.get(`${BASE}/opciones`, { params: { hasta } })).data.data
}
