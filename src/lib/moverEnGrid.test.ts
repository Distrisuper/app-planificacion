import { describe, it, expect } from 'vitest'
import { moverEnGrid } from './moverEnGrid'
import type { IAgendaClientAdmin, IRotacionCompleta } from '@/types/planificacion'

const card = (id: number, dia: number): IAgendaClientAdmin => ({
    rotacionClienteId: id,
    codigoParticularCliente: `C${id}`,
    nombreCliente: `Cliente ${id}`,
    dia,
    estado: 'pendiente',
    ultimoMovimiento: null,
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
