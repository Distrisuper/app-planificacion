import { getResumen, getVisitas, getVisitaDetalle, getObjeciones, getVendedores } from './analitica'
import { MOCK_RESUMEN, MOCK_VISITAS, MOCK_OBJECIONES } from '@/mocks/analiticaMock'
import { isoLocal } from '@/lib/fechas'

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
    const res = await getVisitas({ ...FILTRO, vendedor: 'V1', tipo: ['visita'] })
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
    const esperado = [...MOCK_OBJECIONES.motivos].sort((a, b) => b.cantidad - a.cantidad)
    expect(res.motivos).toEqual(esperado)
})

it('getVendedores devuelve el roster completo, no solo a los que tuvieron actividad', async () => {
    const roster = await getVendedores()
    expect(roster.length).toBeGreaterThan(MOCK_RESUMEN.vendedores.length)
    expect(roster.some(v => v.codigoParticularVendedor === 'V11')).toBe(true)
})

it('getVisitas sin vendedor devuelve las filas de todo el equipo', async () => {
    const res = await getVisitas(FILTRO)
    const codigos = new Set(res.visitas.map(v => v.codigoParticularVendedor))
    expect(codigos.size).toBeGreaterThan(1)
})

it('getVisitas ordena de la más reciente a la más vieja', async () => {
    const res = await getVisitas(FILTRO)
    const claves = res.visitas.map(v => v.fechaInicio)
    expect(claves).toEqual([...claves].sort().reverse())
})

it('getVisitas trae las tres resoluciones y las filtra por tipo', async () => {
    const todas = await getVisitas(FILTRO)
    const tipos = new Set(todas.visitas.map(v => v.tipo))
    expect(tipos).toEqual(new Set(['visita', 'no_visita', 'reagendada']))

    const soloNoVisita = await getVisitas({ ...FILTRO, tipo: ['no_visita'] })
    expect(soloNoVisita.visitas.every(v => v.tipo === 'no_visita')).toBe(true)
    expect(soloNoVisita.visitas.length).toBeGreaterThan(0)
})

it('una no-visita trae motivos pero no resultado ni duración', async () => {
    const res = await getVisitas({ ...FILTRO, tipo: ['no_visita'] })
    const fila = res.visitas[0]
    expect(fila.motivos.length).toBeGreaterThan(0)
    expect(fila.resultado).toBeNull()
    expect(fila.fechaFin).toBeNull()
    expect(fila.duracionMin).toBeNull()
})

it('una reagendada no trae motivos', async () => {
    const res = await getVisitas({ ...FILTRO, tipo: ['reagendada'] })
    expect(res.visitas[0].motivos).toEqual([])
})

it('el rango de hoy trae actividad, incluida una visita en curso', async () => {
    const hoy = isoLocal(new Date())
    const res = await getVisitas({ desde: hoy, hasta: hoy })
    expect(res.visitas.length).toBeGreaterThan(0)
    expect(res.visitas.some(v => v.tipo === 'visita' && v.fechaFin === null)).toBe(true)
})
