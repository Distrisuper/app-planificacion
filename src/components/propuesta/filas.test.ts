import { construirFilasPropuesta, construirFilasVisita, separarSegmentos, totalesDe } from './filas'
import type { IOfrecimiento, IRubroEstado, IRubroPropuesta } from '@/types/planificacion'

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
        marcas: [],
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
        expect(filas.map(f => f.codigo)).toEqual(['R1', 'R2'])
        expect(filas.every(f => f.destacada)).toBe(true)
    })

    it('colapsada trae sólo los rubros de la propuesta', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros' })],
            false,
        )
        expect(filas.map(f => f.codigo)).toEqual(['R1'])
    })

    it('expandida trae todos los rubros del cliente sin duplicar los de la propuesta', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros', actual: 100 })],
            true,
        )
        expect(filas.map(f => f.codigo)).toEqual(['R1', 'R2'])
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
                codigo: 'R3',
                nombre: 'Lubricantes',
                actual: 500_000,
                mesAnterior: 700_000,
                promedio6m: 900_000,
                destacada: true,
                tipo: 'rubro',
                alcance: [],
                marcas: [],
            },
        ])
    })

    it('sin fallback ni rubroStatus, un rubro propuesto muestra – en las tres columnas', () => {
        const filas = construirFilasPropuesta([propuesta({ rubroCode: 'R4', nombre: 'Correas' })], [], false)
        expect(filas[0]).toMatchObject({ actual: null, mesAnterior: null, promedio6m: null })
    })

    it('expandida ordena "otros rubros" por el 80/20, no por el orden del backend', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [
                estado({ rubroCode: 'R1' }),
                // Llegan en orden inverso al 80/20 (335=PARRILLAS antes que 322=AMORT):
                estado({ rubroCode: '331', nombre: 'Bieletas' }),
                estado({ rubroCode: '335', nombre: 'Parrillas' }),
                estado({ rubroCode: '322', nombre: 'Amortiguadores' }),
            ],
            true,
        )
        expect(filas.map(f => f.codigo)).toEqual(['R1', '322', '335', '331'])
    })

    it('los totales suman sólo las filas visibles (colapsada vs. expandida)', () => {
        const propuestaRubros = [propuesta({ rubroCode: 'R1' })]
        const status = [estado({ rubroCode: 'R1' }), estado({ rubroCode: 'R2', nombre: 'Filtros', actual: 100_000, mesAnterior: 200_000, promedio6m: 300_000, marcas: [] })]

        const colapsada = construirFilasPropuesta(propuestaRubros, status, false)
        expect(totalesDe(colapsada)).toEqual({ actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })

        const expandida = construirFilasPropuesta(propuestaRubros, status, true)
        expect(totalesDe(expandida)).toEqual({ actual: 700_000, mesAnterior: 1_000_000, promedio6m: 1_300_000 })
    })
})

function ofrecimiento(over: Partial<IOfrecimiento> = {}): IOfrecimiento {
    return {
        id: 7,
        resolucionId: 42,
        tipo: 'rubro',
        codigo: 'AMORT',
        descripcion: 'Amortiguadores',
        gapUnits: 12,
        esPropuesto: true,
        resuelto: false,
        motivos: [],
        alcance: [],
        ...over,
    }
}

describe('construirFilasVisita', () => {
    it('respeta el orden del backend, no reordena por estado', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' }), ofrecimiento({ id: 8, codigo: 'FILT', descripcion: 'Filtros' })],
            [],
            { 7: { motivosCargados: 0, completo: false }, 8: { motivosCargados: 1, completo: true } },
            false,
            true,
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT', 'FILT'])
    })

    it('un rubro de la visita ausente de rubroStatus queda en – en las tres columnas', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [],
            { 7: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0]).toMatchObject({ actual: null, mesAnterior: null, promedio6m: null })
    })

    it('expandida agrega los rubros faltantes del cliente, marcados agregable', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
                { rubroCode: 'BAT', nombre: 'Baterías', actual: 0, mesAnterior: 200_000, promedio6m: 100_000, marcas: [] },
            ],
            { 7: { motivosCargados: 0, completo: false } },
            true,
            true,
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT', 'BAT'])
        expect(filas[1]).toMatchObject({ destacada: false, agregable: true })
        expect(filas[0].agregable).toBeUndefined()
    })

    it('expandida ordena "otros rubros" por el 80/20, no por el orden del backend', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
                { rubroCode: '331', nombre: 'Bieletas', actual: 0, mesAnterior: 0, promedio6m: 0, marcas: [] },
                { rubroCode: '335', nombre: 'Parrillas', actual: 0, mesAnterior: 0, promedio6m: 0, marcas: [] },
                { rubroCode: '322', nombre: 'Amortiguadores', actual: 0, mesAnterior: 0, promedio6m: 0, marcas: [] },
            ],
            { 7: { motivosCargados: 0, completo: false } },
            true,
            true,
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT', '322', '335', '331'])
    })

    it('con la visita cerrada, ninguna fila trae resolucion ni agregable', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
                { rubroCode: 'BAT', nombre: 'Baterías', actual: 0, mesAnterior: 200_000, promedio6m: 100_000, marcas: [] },
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
            [ofrecimiento({ id: 7, codigo: 'AMORT', esPropuesto: true })],
            [],
            { 7: { motivosCargados: 2, completo: true } },
            false,
            true,
        )
        expect(filas[0].resolucion).toEqual({
            ofrecimientoId: 7,
            motivosCargados: 2,
            completo: true,
            esPropuesto: true,
        })
    })

    it('un rubro que no es de la propuesta trae resolucion.esPropuesto en false', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 8, codigo: 'FILT', esPropuesto: false })],
            [],
            { 8: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0].resolucion?.esPropuesto).toBe(false)
    })

    it('propaga el tipo y el alcance del ofrecimiento a la fila', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 9, codigo: 'CUPO', tipo: 'accion', alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }] })],
            [],
            { 9: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0].tipo).toBe('accion')
        expect(filas[0].alcance).toEqual([{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }])
    })

    it('propaga el detalle del ofrecimiento a la fila', () => {
        const filas = construirFilasVisita(
            [
                ofrecimiento({
                    id: 9,
                    codigo: 'CUPO',
                    tipo: 'accion',
                    detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
                }),
            ],
            [],
            { 9: { motivosCargados: 0, completo: false } },
            false,
            true,
        )
        expect(filas[0].detalle).toEqual({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })
    })

    // Cliente sin movimientos: client-context devuelve `rubros: []` (y está bien —
    // nunca compró). Sin el catálogo, el bloque de abajo quedaba vacío y el vendedor
    // no tenía NADA para agregar. Ver spec 2026-09-16-rubros-agregables-desde-el-catalogo.
    it('sin historial, el catálogo puebla el bloque de abajo con filas agregables en –', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [],
            { 7: { motivosCargados: 0, completo: false } },
            true,
            true,
            [
                { code: 'BAT', description: 'Baterías' },
                { code: 'FILT', description: 'Filtros' },
            ],
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT', 'BAT', 'FILT'])
        expect(filas[1]).toMatchObject({
            nombre: 'Baterías',
            actual: null,
            mesAnterior: null,
            promedio6m: null,
            destacada: false,
            agregable: true,
            tipo: 'rubro',
            marcas: [],
        })
    })

    it('el catálogo va después del historial y no duplica ni la visita ni el historial', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [
                { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
                { rubroCode: 'BAT', nombre: 'Baterías', actual: 300_000, mesAnterior: 0, promedio6m: 100_000, marcas: [] },
            ],
            { 7: { motivosCargados: 0, completo: false } },
            true,
            true,
            [
                { code: 'AMORT', description: 'Amortiguadores' },
                { code: 'BAT', description: 'Baterías' },
                { code: 'FILT', description: 'Filtros' },
            ],
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT', 'BAT', 'FILT'])
        // BAT conserva sus números: el que manda es el historial, el catálogo solo suma
        // los que faltan.
        expect(filas[1]).toMatchObject({ actual: 300_000, agregable: true })
        expect(filas[2]).toMatchObject({ actual: null, agregable: true })
    })

    it('colapsada no trae el catálogo', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [],
            { 7: { motivosCargados: 0, completo: false } },
            false,
            true,
            [{ code: 'BAT', description: 'Baterías' }],
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT'])
    })

    // La visita cerrada es de consulta: no hay nada que agregar, así que listar el
    // catálogo entero sería decenas de filas muertas.
    it('con la visita cerrada, el catálogo no aparece', () => {
        const filas = construirFilasVisita(
            [ofrecimiento({ id: 7, codigo: 'AMORT' })],
            [],
            { 7: { motivosCargados: 1, completo: true } },
            true,
            false,
            [{ code: 'BAT', description: 'Baterías' }],
        )
        expect(filas.map(f => f.codigo)).toEqual(['AMORT'])
    })
})

describe('separarSegmentos', () => {
    function filaDe(over: Partial<import('./filas').IOfrecimientoFila> = {}) {
        return {
            codigo: 'R1',
            nombre: 'Amortiguadores',
            actual: null,
            mesAnterior: null,
            promedio6m: null,
            destacada: true,
            tipo: 'rubro' as const,
            alcance: [],
            marcas: [],
            ...over,
        }
    }

    it('sin acciones ni marcas, todo queda en resto', () => {
        const filas = [filaDe({ codigo: 'R1' }), filaDe({ codigo: 'R2', tipo: 'rubro' })]
        const { acciones, marcas, resto } = separarSegmentos(filas)
        expect(acciones).toEqual([])
        expect(marcas).toEqual([])
        expect(resto).toEqual(filas)
    })

    it('separa una acción del resto', () => {
        const rubro = filaDe({ codigo: 'R1' })
        const accion = filaDe({ codigo: 'CUPO', nombre: 'Plan cupo', tipo: 'accion' })
        const { acciones, marcas, resto } = separarSegmentos([rubro, accion])
        expect(acciones).toEqual([accion])
        expect(marcas).toEqual([])
        expect(resto).toEqual([rubro])
    })

    it('separa una marca del resto', () => {
        const rubro = filaDe({ codigo: 'R1' })
        const marca = filaDe({ codigo: 'AG', nombre: 'AG', tipo: 'marca' })
        const { acciones, marcas, resto } = separarSegmentos([rubro, marca])
        expect(acciones).toEqual([])
        expect(marcas).toEqual([marca])
        expect(resto).toEqual([rubro])
    })

    it('separa acciones y marcas a la vez, cada una en su lista, preservando el orden', () => {
        const rubro1 = filaDe({ codigo: 'R1' })
        const cupo = filaDe({ codigo: 'CUPO', tipo: 'accion' })
        const ag = filaDe({ codigo: 'AG', tipo: 'marca' })
        const rubro2 = filaDe({ codigo: 'R2' })
        const descuento = filaDe({ codigo: 'DESCUENTO', tipo: 'accion' })
        const skf = filaDe({ codigo: 'SKF', tipo: 'marca' })
        const { acciones, marcas, resto } = separarSegmentos([
            rubro1,
            cupo,
            ag,
            rubro2,
            descuento,
            skf,
        ])
        expect(acciones).toEqual([cupo, descuento])
        expect(marcas).toEqual([ag, skf])
        expect(resto).toEqual([rubro1, rubro2])
    })
})

const marcaFremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }

describe('marcas en la fila', () => {
    it('construirFilasPropuesta pasa las marcas del rubroStatus a la fila destacada y a las del catálogo', () => {
        const filas = construirFilasPropuesta(
            [propuesta({ rubroCode: 'R1' })],
            [estado({ rubroCode: 'R1', marcas: [marcaFremax] }), estado({ rubroCode: 'R2', nombre: 'Filtros', marcas: [] })],
            true,
        )
        expect(filas[0].marcas).toEqual([marcaFremax])
        expect(filas[1].marcas).toEqual([])
    })

    it('un rubro de la propuesta sin rubroStatus lleva marcas: []', () => {
        const filas = construirFilasPropuesta([propuesta({ rubroCode: 'R1' })], [], false)
        expect(filas[0].marcas).toEqual([])
    })

    it('construirFilasVisita pasa las marcas al ofrecimiento tipo rubro y [] a los demás tipos', () => {
        const filas = construirFilasVisita(
            [
                { id: 1, resolucionId: 1, tipo: 'rubro', codigo: 'R1', descripcion: 'A', gapUnits: null, esPropuesto: true, resuelto: false, motivos: [], alcance: [] },
                { id: 2, resolucionId: 1, tipo: 'accion', codigo: 'CUPO', descripcion: 'Plan cupo', gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [] },
            ],
            [estado({ rubroCode: 'R1', marcas: [marcaFremax] })],
            {},
            false,
            true,
        )
        expect(filas[0].marcas).toEqual([marcaFremax])
        expect(filas[1].marcas).toEqual([])
    })
})
