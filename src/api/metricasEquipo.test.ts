import { vi } from 'vitest'
import { apiClient } from './apiClient'

// Estos tests son del pedido HTTP real: apagan el modo demo que Vitest prende por defecto.
vi.stubEnv('VITE_ANALITICA_MOCK', '0')

const cargar = async () => {
    vi.resetModules()
    const { apiClient: cliente } = await import('./apiClient')
    const api = await import('./metricasEquipo')
    return { cliente: cliente as typeof apiClient, api }
}

afterEach(() => vi.restoreAllMocks())

it('getVentasVendedores pide los períodos default de Versus para todos los vendedores', async () => {
    const { cliente, api } = await cargar()
    const post = vi.spyOn(cliente, 'post').mockResolvedValue({
        data: {
            data: {
                entities: [
                    { code: 'V 1', name: 'MARCO', kind: 'seller', meta: {}, totalsByPeriod: { thisMonth: { units: 1, amount: 2 } } },
                    { code: null, name: 'SIN CODIGO', totalsByPeriod: {} },
                ],
            },
        },
    })

    const ventas = await api.getVentasVendedores()

    expect(post).toHaveBeenCalledWith('/sale/analytics', {
        path: [{ dimension: 'seller', value: null }],
        responseFormat: 'modern',
    })
    // La fila sin código se descarta, como en Versus.
    expect(ventas.map(v => v.code)).toEqual(['V 1'])
})

it('getObjecionesPorPersona y getProductividadTv pegan a los endpoints de analítica', async () => {
    const { cliente, api } = await cargar()
    const get = vi.spyOn(cliente, 'get').mockResolvedValue({ data: { data: { ok: true } } })

    await api.getObjecionesPorPersona({ desde: '2026-10-01', hasta: '2026-10-31', rubro: '12' })
    await api.getProductividadTv({ desde: '2026-10-01', hasta: '2026-10-31' })

    expect(get).toHaveBeenNthCalledWith(1, '/planificacion/analitica/objeciones/por-persona', {
        params: { desde: '2026-10-01', hasta: '2026-10-31', rubro: '12' },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/planificacion/analitica/televentas/productividad', {
        params: { desde: '2026-10-01', hasta: '2026-10-31' },
    })
})
