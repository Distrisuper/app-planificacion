import { describe, expect, it } from 'vitest'
import { getMetricas, getMetricasClientes } from './metricas'
import { MOCK_METRICAS, MOCK_METRICAS_ANTERIOR, MOCK_METRICAS_EQUIPO, MOCK_CLIENTES } from '@/mocks/metricasMock'
import { mesActual, mesAnterior } from '@/lib/metricas/mes'

describe('api/metricas (fixture)', () => {
    it('este mes → MOCK_METRICAS; mes anterior → MOCK_METRICAS_ANTERIOR', async () => {
        expect(await getMetricas({ mes: mesActual() })).toEqual(MOCK_METRICAS)
        expect(await getMetricas({ mes: mesAnterior(mesActual()) })).toEqual(MOCK_METRICAS_ANTERIOR)
    })
    it('equipo → MOCK_METRICAS_EQUIPO', async () => {
        expect(await getMetricas({ mes: mesActual(), vendedor: 'equipo' })).toEqual(MOCK_METRICAS_EQUIPO)
    })
    it('clientes → MOCK_CLIENTES', async () => {
        expect(await getMetricasClientes({ mes: mesActual(), estado: 'Inactivo' })).toEqual(MOCK_CLIENTES)
    })
})
