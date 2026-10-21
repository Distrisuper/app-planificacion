import { describe, it, expect } from 'vitest'
import { moverEnGrid, moverEnRutaBase } from './moverEnGrid'
import type { IAgendaClientAdmin, IRotacionCompleta, IRutaBase } from '@/types/planificacion'

const card = (id: number, dia: number): IAgendaClientAdmin => ({
    rotacionClienteId: id,
    codigoParticularCliente: `C${id}`,
    nombreCliente: `Cliente ${id}`,
    dia,
    estado: 'pendiente',
    eliminado: false,
    ultimoMovimiento: null,
    esExtra: false,
})

const vacia = () => ({ LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] })

const GRID: IRotacionCompleta = {
    id: 7,
    codigoParticularVendedor: 'V 2',
    estado: 'abierta',
    fechaInicio: null,
    fechaFin: null,
    descripcion: null,
    orden: null,
    semanas: [
        {
            semana: 1,
            descripcion: 'Zona Norte',
            dias: { ...vacia(), LUN: [card(11, 1), card(12, 1)], MAR: [card(13, 2)] },
        },
        { semana: 3, descripcion: null, dias: vacia() },
    ],
}

describe('moverEnGrid', () => {
    it('mueve la card de día dentro de la misma semana', () => {
        const g = moverEnGrid(GRID, 11, undefined, 4)

        expect(g.semanas[0].dias.LUN.map(c => c.rotacionClienteId)).toEqual([12])
        expect(g.semanas[0].dias.JUE.map(c => c.rotacionClienteId)).toEqual([11])
        // El `dia` de la card también se actualiza: es lo que el grid usa para ubicarla.
        expect(g.semanas[0].dias.JUE[0].dia).toBe(4)
    })

    it('mueve la card a otra semana', () => {
        const g = moverEnGrid(GRID, 13, 3, 5)

        expect(g.semanas[0].dias.MAR).toEqual([])
        expect(g.semanas[1].dias.VIE.map(c => c.rotacionClienteId)).toEqual([13])
    })

    it('no muta el grid original', () => {
        const antes = JSON.stringify(GRID)
        moverEnGrid(GRID, 11, 3, 2)
        // React Query compara por referencia para decidir si re-renderiza; mutar el objeto
        // en caché deja la UI sin actualizar y además rompe el rollback ante error.
        expect(JSON.stringify(GRID)).toBe(antes)
    })

    it('deja el grid igual si la semana destino no existe', () => {
        const g = moverEnGrid(GRID, 11, 99, 1)
        expect(g).toEqual(GRID)
    })

    it('deja el grid igual si la fila no está en el grid', () => {
        const g = moverEnGrid(GRID, 999, 3, 1)
        expect(g).toEqual(GRID)
    })

    it('deja el grid igual si el día está fuera de 1..5', () => {
        expect(moverEnGrid(GRID, 11, undefined, 0)).toEqual(GRID)
        expect(moverEnGrid(GRID, 11, undefined, 6)).toEqual(GRID)
    })
})

describe('moverEnRutaBase', () => {
    const fila = (id: number, eliminado = false) => ({
        id,
        codigoParticularCliente: `C${id}`,
        nombreCliente: `Cliente ${id}`,
        orden: 0,
        eliminado,
    })
    const RUTA: IRutaBase = {
        semanas: [
            { semana: 1, descripcion: 'Zona Norte', dias: { ...vacia(), LUN: [fila(5), fila(6)] } },
            { semana: 2, descripcion: null, dias: vacia() },
        ],
        omitidos: ['P404'],
    }

    it('mueve la fila a otra semana y día, sin tocar los omitidos', () => {
        const r = moverEnRutaBase(RUTA, 5, 2, 3)

        expect(r.semanas[0].dias.LUN.map(c => c.id)).toEqual([6])
        expect(r.semanas[1].dias.MIE.map(c => c.id)).toEqual([5])
        expect(r.omitidos).toEqual(['P404'])
    })

    it('no muta la ruta original', () => {
        const antes = JSON.stringify(RUTA)
        moverEnRutaBase(RUTA, 5, 2, 3)
        expect(JSON.stringify(RUTA)).toBe(antes)
    })

    it('deja la ruta igual si la semana destino no está dibujada', () => {
        // La siguiente a la última es válida para el backend, pero acá no hay fila donde
        // ponerla: el optimista no inventa una semana, la trae la relectura.
        expect(moverEnRutaBase(RUTA, 5, 3, 1)).toEqual(RUTA)
    })

    it('deja la ruta igual si la fila no está', () => {
        expect(moverEnRutaBase(RUTA, 999, 2, 1)).toEqual(RUTA)
    })

    describe('con posición', () => {
        const DIA: IRutaBase = {
            semanas: [
                {
                    semana: 1,
                    descripcion: null,
                    dias: { ...vacia(), LUN: [fila(1), fila(2), fila(3), fila(9, true)], MAR: [fila(4)] },
                },
            ],
            omitidos: [],
        }
        const lun = (r: IRutaBase) => r.semanas[0].dias.LUN.map(c => c.id)

        it('reordena dentro del día: la posición es el lugar final entre los activos', () => {
            expect(lun(moverEnRutaBase(DIA, 1, 1, 1, 2))).toEqual([2, 3, 1, 9])
            expect(lun(moverEnRutaBase(DIA, 3, 1, 1, 0))).toEqual([3, 1, 2, 9])
        })

        it('desde otro día entra en esa posición, antes de los quitados', () => {
            expect(lun(moverEnRutaBase(DIA, 4, 1, 1, 1))).toEqual([1, 4, 2, 3, 9])
            expect(lun(moverEnRutaBase(DIA, 4, 1, 1, 3))).toEqual([1, 2, 3, 4, 9])
        })

        it('sin posición va al final de los activos', () => {
            expect(lun(moverEnRutaBase(DIA, 4, 1, 1))).toEqual([1, 2, 3, 4, 9])
        })
    })
})
