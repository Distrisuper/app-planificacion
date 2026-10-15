import { formatVentas, sumarVendedores, tonoCelda, valorColumna } from './facturacion'
import type { IVentasVendedor } from '@/types/metricasEquipo'

const V: IVentasVendedor = {
    code: 'V 1',
    name: 'MARCO EMILIANO',
    totalsByPeriod: {
        thisMonth: { units: 10, amount: 230_373, sr: 4 },
        lastMonth: { units: 20, amount: 504_980, sr: 6 },
        last3Months: { units: 60, amount: 1_321_821, sr: 15 },
        last6Months: { units: 120, amount: 2_368_878, sr: 30 },
        last12Months: { units: 240, amount: 4_660_908 },
    },
}

describe('valorColumna', () => {
    it('lee pesos, unidades o SR según la vista', () => {
        expect(valorColumna(V, 'actual', '$')).toBe(230_373)
        expect(valorColumna(V, 'actual', 'u')).toBe(10)
        expect(valorColumna(V, 'actual', 'sr')).toBe(4)
    })

    it('los P.xM son promedios mensuales, no el acumulado', () => {
        expect(valorColumna(V, 'p3m', '$')).toBeCloseTo(440_607, 0)
        expect(valorColumna(V, 'p6m', 'u')).toBe(20)
        expect(valorColumna(V, 'p12m', 'u')).toBe(20)
    })

    it('SR ausente o período ausente cuentan 0', () => {
        expect(valorColumna(V, 'p12m', 'sr')).toBe(0)
        expect(valorColumna({ ...V, totalsByPeriod: {} }, 'mant', '$')).toBe(0)
    })
})

it('sumarVendedores arma TOTALES período por período', () => {
    const otro: IVentasVendedor = {
        code: 'V 2',
        name: 'OTRO',
        totalsByPeriod: { thisMonth: { units: 5, amount: 100, sr: 1 } },
    }
    const t = sumarVendedores([V, otro])
    expect(t.code).toBe('__TOTALES__')
    expect(t.totalsByPeriod.thisMonth).toEqual({ units: 15, amount: 230_473, sr: 5 })
    expect(t.totalsByPeriod.lastMonth).toEqual({ units: 20, amount: 504_980, sr: 6 })
})

describe('tonoCelda (contra P.6M, umbrales de Versus)', () => {
    it.each([
        [130, 'alto'],
        [129, 'ok'],
        [90, 'ok'],
        [89, 'atencion'],
        [70, 'atencion'],
        [69, 'bajo'],
        [20, 'bajo'],
        [19, 'critico'],
        [-5, 'critico'],
    ])('%d contra 100 → %s', (valor, tono) => {
        expect(tonoCelda(valor, 100)).toBe(tono)
    })

    it('un cero no se pinta', () => {
        expect(tonoCelda(0, 100)).toBe('sin_valor')
    })

    it('sin referencia (o referencia negativa): positivo es alto, negativo crítico', () => {
        expect(tonoCelda(10, 0)).toBe('alto')
        expect(tonoCelda(-10, 0)).toBe('critico')
        expect(tonoCelda(10, -50)).toBe('alto')
        expect(tonoCelda(-10, -50)).toBe('critico')
    })
})

it('formatVentas: enteros con miles; SR con un decimal', () => {
    expect(formatVentas(1_769_950.4, '$')).toBe('1.769.950')
    expect(formatVentas(12.5, 'sr')).toBe('12,5')
})
