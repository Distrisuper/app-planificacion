import { vi } from 'vitest'
import { getResumen, getVisitas, getVisitaDetalle, getObjeciones } from './analitica'
import { MOCK_RESUMEN, MOCK_VISITAS } from '@/mocks/analiticaMock'

// El fixture está activo por defecto en tests (VITE_ANALITICA_MOCK=1 en .env).
const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24' }

it('getResumen devuelve el fixture completo cuando no se filtra por vendedor', async () => {
    const res = await getResumen(FILTRO)
    expect(res.vendedores).toHaveLength(MOCK_RESUMEN.vendedores.length)
})

it('getResumen filtra por los vendedores pedidos', async () => {
    const res = await getResumen({ ...FILTRO, vendedores: ['V1', 'V4'] })
    expect(res.vendedores.map(v => v.codigoParticularVendedor)).toEqual(['V1', 'V4'])
})

it('getResumen recalcula los promedios sobre los vendedores filtrados', async () => {
    const res = await getResumen({ ...FILTRO, vendedores: ['V1'] })
    expect(res.promedios.cobertura).toBeCloseTo(MOCK_RESUMEN.vendedores[0].cobertura!, 5)
})

it('getResumen devuelve la lista vacía si el rango no tiene datos', async () => {
    const res = await getResumen({ desde: '2020-01-01', hasta: '2020-01-05' })
    expect(res.vendedores).toHaveLength(0)
})

it('getVisitas devuelve las visitas del vendedor pedido', async () => {
    const res = await getVisitas({ ...FILTRO, vendedor: 'V1' })
    expect(res.visitas).toHaveLength(MOCK_VISITAS['V1'].length)
    expect(res.total).toBe(MOCK_VISITAS['V1'].length)
})

it('getVisitas filtra por nombre de cliente sin distinguir mayúsculas', async () => {
    const res = await getVisitas({ ...FILTRO, vendedor: 'V1', cliente: 'osano' })
    expect(res.visitas.length).toBeGreaterThan(0)
    expect(res.visitas.every(v => v.nombreCliente.toLowerCase().includes('osano'))).toBe(true)
})

it('getVisitaDetalle devuelve el detalle de una visita existente', async () => {
    const id = MOCK_VISITAS['V1'][0].visitaId
    const det = await getVisitaDetalle(id)
    expect(det.visitaId).toBe(id)
    expect(det.rubros.length).toBeGreaterThan(0)
})

it('getVisitaDetalle rechaza un id inexistente', async () => {
    await expect(getVisitaDetalle(999999)).rejects.toThrow('Visita no encontrada')
})

it('getObjeciones devuelve el ranking ordenado de mayor a menor', async () => {
    const res = await getObjeciones(FILTRO)
    const cantidades = res.motivos.map(m => m.cantidad)
    expect([...cantidades].sort((a, b) => b - a)).toEqual(cantidades)
})
