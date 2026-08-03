import { construirFilasPropuesta, construirFilasVisita, totalesDe } from './filas'
import type { IRubroEstado, IRubroPropuesta, IVisitaRubro } from '@/types/planificacion'

function propuesta(over: Partial<IRubroPropuesta> = {}): IRubroPropuesta {
    return {
        rubroCode: 'R1',
        nombre: 'Amortiguadores',
        pesosPerdidos: 400,
        caidaPct: -0.4,
        isFallback: false,
        reason: 'Cayó 40%',
        ...over,
    }
}

function estado(over: Partial<IRubroEstado> = {}): IRubroEstado {
    return {
        rubroCode: 'R1',
        nombre: 'Amortiguadores',
        actual: 600_000,
        mesAnterior: 800_000,
        promedio6m: 1_000_000,
        ...over,
    }
}

describe('construirFilasPropuesta', () => {
    it('pone los rubros de la propuesta primero y marcados', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' }), propuesta({ rubroCode: 'R2', nombre: 'Filtros' })],
            [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros' })],
            false,
        )
        expect(filas.map(f => f.rubroCode)).toEqual(['R1', 'R2'])
        expect(filas.every(f => f.destacada)).toBe(true)
    })

    it('colapsada trae sólo los rubros de la propuesta', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros' })],
            false,
        )
        expect(filas.map(f => f.rubroCode)).toEqual(['R1'])
    })

    it('expandida trae todos los rubros del cliente sin duplicar los de la propuesta', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros', actual: 100 })],
            true,
        )
        expect(filas.map(f => f.rubroCode)).toEqual(['R1', 'R2'])
        expect(filas[0].destacada).toBe(true)
        expect(filas[1].destacada).toBe(false)
    })

    it('un rubro propuesto ausente de rubroStatus usa su propio fallback (current/prev/baseline)', () => {
        const filas = construirFilasPropuesta(
            [
                propuesta({
                    rubroCode: 'R3',
                    nombre: 'Lubricantes',
                    current: { yearMonth: '2026-07', actual: 500_000, projected: null, baseline: 900_000, dropPct: -0.4, lost: 400_000, isRed: true },
                    prev: { yearMonth: '2026-06', actual: 700_000, projected: null, baseline: 900_000, dropPct: -0.2, lost: 200_000, isRed: true },
                }),
            ],
            [], // rubroStatus vacío: no trajo R3
            false,
        )
        expect(filas).toEqual([
            {
                rubroCode: 'R3',
                nombre: 'Lubricantes',
                actual: 500_000,
                mesAnterior: 700_000,
                promedio6m: 900_000,
                destacada: true,
            },
        ])
    })

    it('sin fallback ni rubroStatus, un rubro propuesto muestra – en las tres columnas', () => {
        const filas = construirFilasPropuesta([propuesta({ rubroCode: 'R4', nombre: 'Correas' })], [], false)
        expect(filas[0]).toMatchObject({ actual: null, mesAnterior: null, promedio6m: null })
    })

    it('los totales suman sólo las filas visibles (colapsada vs. expandida)', () => {
        const propuestaRubros = [propuesta({ rubroCode: 'R1' })]
        const status = [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros', actual: 100_000, mesAnterior: 200_000, promedio6m: 300_000 })]

        const colapsada = construirFilasPropuesta(propuestaRubros, status, false)
        expect(totalesDe(colapsada)).toEqual({ actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })

        const expandida = construirFilasPropuesta(propuestaRubros, status, true)
        expect(totalesDe(expandida)).toEqual({ actual: 700_000, mesAnterior: 1_000_000, promedio6m: 1_300_000 })
    })
})

function visitaRubro(over: Partial<IVisitaRubro> = {}): IVisitaRubro {
    return {
        id: 7,
        resolucionId: 42,
        rubroCode: 'AMORT',
        rubroDescripcion: 'Amortiguadores',
        gapUnits: 12,
        esPropuesto: true,
        resuelto: false,
        motivos: [],
        ...over,
    }
}

describe('construirFilasVisita', () => {
    it('respeta el orden del backend, no reordena por estado', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 7, rubroCode: 'AMORT' }), visitaRubro({ id: 8, rubroCode: 'FILT', rubroDescripcion: 'Filtros' })],
            [],
            { 7: { motivosCargados: 0, completo: false }, 8: { motivosCargados: 1, completo: true } },
            false,
            true,
        )
        expect(filas.map(f => f.rubroCode)).toEqual(['AMORT', 'FILT'])
    })

    it('un rubro de la visita ausente de rubroStatus queda en – en las tres columnas', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 7, rubroCode: 'AMORT' })],
            [],
            { 7: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0]).toMatchObject({ actual: null, mesAnterior: null, promedio6m: null })
    })

    it('expandida agrega los rubros faltantes del cliente, marcados agregable', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 7, rubroCode: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 },
                { rubroCode: 'BAT', nombre: 'Baterías', actual: 0, mesAnterior: 200_000, promedio6m: 100_000 },
            ],
            { 7: { motivosCargados: 0, completo: false } },
            true,
            true,
        )
        expect(filas.map(f => f.rubroCode)).toEqual(['AMORT', 'BAT'])
        expect(filas[1]).toMatchObject({ destacada: false, agregable: true })
        expect(filas[0].agregable).toBeUndefined()
    })

    it('con la visita cerrada, ninguna fila trae resolucion ni agregable', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 7, rubroCode: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 },
                { rubroCode: 'BAT', nombre: 'Baterías', actual: 0, mesAnterior: 200_000, promedio6m: 100_000 },
            ],
            { 7: { motivosCargados: 1, completo: true } },
            true,
            false,
        )
        expect(filas.every(f => f.resolucion === undefined)).toBe(true)
        expect(filas.every(f => f.agregable === undefined)).toBe(true)
    })

    it('editable trae resolucion con motivosCargados y completo del estado dado', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 7, rubroCode: 'AMORT', esPropuesto: true })],
            [],
            { 7: { motivosCargados: 2, completo: true } },
            false,
            true,
        )
        expect(filas[0].resolucion).toEqual({
            visitaRubroId: 7,
            motivosCargados: 2,
            completo: true,
            esPropuesto: true,
        })
    })

    it('un rubro que no es de la propuesta trae resolucion.esPropuesto en false', () => {
        const filas = construirFilasVisita(
            [visitaRubro({ id: 8, rubroCode: 'FILT', esPropuesto: false })],
            [],
            { 8: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0].resolucion?.esPropuesto).toBe(false)
    })
})
