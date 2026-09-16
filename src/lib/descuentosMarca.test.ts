import { describe, it, expect } from 'vitest'
import {
    esSuscriptor,
    descuentosPorCodigo,
    nombreDescuento,
    listaDescuentos,
} from './descuentosMarca'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(over: Partial<IVisitClientCard> = {}): IVisitClientCard {
    return {
        codigoCliente: '10034',
        codigoParticularCliente: '10034-1',
        nombreCliente: 'DERQUI AUTOPARTES SRL',
        bonusDiscount: 0,
        brandDiscounts: [
            { code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' },
            { code: '039', value: 23, description: 'AG # RESORTES #' },
        ],
        ...over,
    }
}

describe('esSuscriptor', () => {
    it('45 y 49 son suscriptor', () => {
        expect(esSuscriptor(cliente({ bonusDiscount: 45 }))).toBe(true)
        expect(esSuscriptor(cliente({ bonusDiscount: 49 }))).toBe(true)
    })

    // 44 y 46 a propósito: descarta una implementación con >= o un rango.
    it('cualquier otro valor no lo es', () => {
        for (const v of [0, 8, 44, 46, 50]) {
            expect(esSuscriptor(cliente({ bonusDiscount: v }))).toBe(false)
        }
    })

    it('sin dato no es suscriptor', () => {
        expect(esSuscriptor(cliente({ bonusDiscount: null }))).toBe(false)
        expect(esSuscriptor(cliente({ bonusDiscount: undefined }))).toBe(false)
        expect(esSuscriptor(null)).toBe(false)
        expect(esSuscriptor(undefined)).toBe(false)
    })
})

describe('descuentosPorCodigo', () => {
    it('indexa por código de marca', () => {
        const m = descuentosPorCodigo(cliente())
        expect(m.get('141')).toBe(15)
        expect(m.get('039')).toBe(23)
        expect(m.size).toBe(2)
    })

    // La razón de toda la feature: el 45% ya es global y el descuento por marca NO se
    // acumula (priceUtils.js de Lupa lo neutraliza). Mostrarlo sería prometer algo que
    // la factura no aplica.
    it('el suscriptor no tiene descuentos por marca aunque el JSONB los traiga', () => {
        expect(descuentosPorCodigo(cliente({ bonusDiscount: 45 })).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ bonusDiscount: 49 })).size).toBe(0)
    })

    // `(elem->>'value')::numeric` vuelve como string si pg no tiene parser para numeric.
    it('acepta el value como string', () => {
        const m = descuentosPorCodigo(
            cliente({ brandDiscounts: [{ code: '141', value: '15' as unknown as number, description: 'COBREQ' }] }),
        )
        expect(m.get('141')).toBe(15)
    })

    it('descarta valores no numéricos, cero y negativos', () => {
        const m = descuentosPorCodigo(
            cliente({
                brandDiscounts: [
                    { code: 'A', value: 'abc' as unknown as number, description: 'A' },
                    { code: 'B', value: 0, description: 'B' },
                    { code: 'C', value: -5, description: 'C' },
                    { code: 'D', value: 12, description: 'D' },
                ],
            }),
        )
        expect(m.has('A')).toBe(false)
        expect(m.has('B')).toBe(false)
        expect(m.has('C')).toBe(false)
        expect(m.get('D')).toBe(12)
    })

    // El enricher de api-vendedores trimea el brand_code; el JSONB puede traer espacios.
    it('trimea el código', () => {
        const m = descuentosPorCodigo(
            cliente({ brandDiscounts: [{ code: ' 141 ', value: 15, description: 'COBREQ' }] }),
        )
        expect(m.get('141')).toBe(15)
    })

    it('sin cliente o sin brandDiscounts devuelve un Map vacío', () => {
        expect(descuentosPorCodigo(null).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ brandDiscounts: undefined })).size).toBe(0)
        expect(descuentosPorCodigo(cliente({ brandDiscounts: [] })).size).toBe(0)
    })
})

describe('nombreDescuento', () => {
    it('limpia los # y une con ·', () => {
        expect(nombreDescuento('COBREQ # LIQUIDOS FRENO #')).toBe('COBREQ · LIQUIDOS FRENO')
    })

    it('sin # lo devuelve tal cual', () => {
        expect(nombreDescuento('COBREQ')).toBe('COBREQ')
    })

    it('con # desbalanceado no rompe ni deja separadores colgando', () => {
        expect(nombreDescuento('COBREQ # LIQUIDOS FRENO')).toBe('COBREQ · LIQUIDOS FRENO')
        expect(nombreDescuento('COBREQ ##')).toBe('COBREQ')
    })

    it('string vacío devuelve string vacío', () => {
        expect(nombreDescuento('')).toBe('')
    })
})

describe('listaDescuentos', () => {
    it('ordena por valor descendente y limpia el nombre', () => {
        expect(listaDescuentos(cliente())).toEqual([
            { code: '039', nombre: 'AG · RESORTES', valor: 23 },
            { code: '141', nombre: 'COBREQ · LIQUIDOS FRENO', valor: 15 },
        ])
    })

    it('el suscriptor devuelve lista vacía', () => {
        expect(listaDescuentos(cliente({ bonusDiscount: 45 }))).toEqual([])
    })
})
