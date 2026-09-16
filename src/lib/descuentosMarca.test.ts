import { describe, it, expect } from 'vitest'
import {
    esSuscriptor,
    descuentosPorCodigo,
    nombreDescuento,
    listaDescuentos,
    conDescuentos,
    hayDescuentosParaMostrar,
} from './descuentosMarca'
import type { IRubroEstado, IVisitClientCard } from '@/types/planificacion'

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

function rubro(over: Partial<IRubroEstado> = {}): IRubroEstado {
    return {
        rubroCode: 'SR-14',
        nombre: 'PARRILLAS',
        actual: 120_000,
        mesAnterior: 98_000,
        promedio6m: 140_000,
        marcas: [
            { code: '141', nombre: 'COBREQ', actual: 80_000, mesAnterior: 70_000, promedio6m: 95_000, dejo: false },
            { code: '999', nombre: 'FERODO', actual: 40_000, mesAnterior: 28_000, promedio6m: 45_000, dejo: false },
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

describe('conDescuentos', () => {
    it('pega el descuento a la marca que lo tiene y deja la otra sin campo', () => {
        const [r] = conDescuentos([rubro()], cliente())
        expect(r.marcas[0].descuento).toBe(15)
        expect(r.marcas[1].descuento).toBeUndefined()
    })

    it('no toca el resto de la marca ni del rubro', () => {
        const [r] = conDescuentos([rubro()], cliente())
        expect(r.rubroCode).toBe('SR-14')
        expect(r.marcas[0].nombre).toBe('COBREQ')
        expect(r.marcas[0].actual).toBe(80_000)
        expect(r.marcas).toHaveLength(2)
    })

    it('el suscriptor no recibe ningún descuento', () => {
        const [r] = conDescuentos([rubro()], cliente({ bonusDiscount: 45 }))
        expect(r.marcas.every(m => m.descuento === undefined)).toBe(true)
    })

    it('sin cliente devuelve el mismo array, sin recorrerlo', () => {
        const entrada = [rubro()]
        expect(conDescuentos(entrada, null)).toBe(entrada)
    })

    // Las filas del catálogo (spec de "otros rubros 80/20") llegan con marcas: [].
    it('un rubro sin marcas no rompe', () => {
        const [r] = conDescuentos([rubro({ marcas: [] })], cliente())
        expect(r.marcas).toEqual([])
    })

    it('no muta la entrada', () => {
        const entrada = [rubro()]
        conDescuentos(entrada, cliente())
        expect(entrada[0].marcas[0].descuento).toBeUndefined()
    })
})

describe('hayDescuentosParaMostrar', () => {
    it('con descuentos, sí', () => {
        expect(hayDescuentosParaMostrar(cliente())).toBe(true)
    })

    // El suscriptor es la excepción: su lista está vacía, pero el sheet es donde se entera
    // de que tiene el 45% global. Esconderlo sería esconder el caso que más importa.
    it('el suscriptor sí, aunque su lista esté vacía', () => {
        expect(hayDescuentosParaMostrar(cliente({ brandDiscounts: [], bonusDiscount: 45 }))).toBe(true)
    })

    it('sin descuentos y sin ser suscriptor, no', () => {
        expect(hayDescuentosParaMostrar(cliente({ brandDiscounts: [], bonusDiscount: 0 }))).toBe(false)
    })

    it('sin cliente, no', () => {
        expect(hayDescuentosParaMostrar(null)).toBe(false)
        expect(hayDescuentosParaMostrar(undefined)).toBe(false)
    })
})
