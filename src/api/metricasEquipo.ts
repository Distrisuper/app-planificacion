import { apiClient } from './apiClient'
import {
    MOCK_OBJECIONES_POR_PERSONA,
    MOCK_PRODUCTIVIDAD_TV,
    MOCK_RUBROS,
    MOCK_VENTAS_VENDEDORES,
} from '@/mocks/metricasEquipoMock'
import type { IAnaliticaFiltro } from '@/types/analitica'
import type {
    IObjecionesPorPersona,
    IProductividadTvResponse,
    IRubroCatalogo,
    IVentasVendedor,
} from '@/types/metricasEquipo'

/** Pestaña Métricas de gerencia (/analitica/metricas). Mismo modo demo que analitica.ts. */
const USA_MOCK = import.meta.env.VITE_ANALITICA_MOCK === '1'

export const getProductividadTv = async (
    filtro: Pick<IAnaliticaFiltro, 'desde' | 'hasta'>,
): Promise<IProductividadTvResponse> => {
    if (USA_MOCK) return { ...MOCK_PRODUCTIVIDAD_TV, desde: filtro.desde, hasta: filtro.hasta }
    const res = await apiClient.get('/planificacion/analitica/televentas/productividad', {
        params: { desde: filtro.desde, hasta: filtro.hasta },
    })
    return res.data.data
}

export interface IObjecionesPorPersonaArgs {
    desde: string
    hasta: string
    rubro?: string
}

export const getObjecionesPorPersona = async (
    args: IObjecionesPorPersonaArgs,
): Promise<IObjecionesPorPersona> => {
    if (USA_MOCK) return MOCK_OBJECIONES_POR_PERSONA
    const res = await apiClient.get('/planificacion/analitica/objeciones/por-persona', { params: args })
    return res.data.data
}

/**
 * Ventas por cartera con los cinco períodos de Versus (mes, mes anterior, 3, 6 y 12 meses)
 * en UNA llamada: POST /sale/analytics sin filtro de fechas, el mismo pedido que hace
 * app-vendedores en /v2/vendedores. Solo se queda con lo que usa Facturación, y descarta
 * filas sin código o nombre (el mismo resguardo que Versus contra datos sucios).
 */
export const getVentasVendedores = async (): Promise<IVentasVendedor[]> => {
    if (USA_MOCK) return MOCK_VENTAS_VENDEDORES
    // "Vendedores · TODOS" de Versus: dimensión 'seller' con valor null (navigationConfig y
    // transformPathToApiBody de app-vendedores).
    const res = await apiClient.post('/sale/analytics', {
        path: [{ dimension: 'seller', value: null }],
        responseFormat: 'modern',
    })
    const raw = res.data.data ?? res.data
    const entidades: unknown[] = Array.isArray(raw?.entities) ? raw.entities : []
    return entidades.filter(
        (e): e is IVentasVendedor =>
            !!e &&
            typeof (e as IVentasVendedor).code === 'string' &&
            typeof (e as IVentasVendedor).name === 'string' &&
            typeof (e as IVentasVendedor).totalsByPeriod === 'object',
    )
}

export const getRubrosCatalogo = async (): Promise<IRubroCatalogo[]> => {
    if (USA_MOCK) return MOCK_RUBROS
    const res = await apiClient.get('/sale/rubro/catalog')
    return res.data.data
}
