import { describe, it, expect } from 'vitest'
import { rutaBaseComoGrid } from './rutaBase'
import type { ISemanaRutaBase } from '@/types/planificacion'

const vacia = () => ({ LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] })

describe('rutaBaseComoGrid', () => {
    const SEMANAS: ISemanaRutaBase[] = [
        {
            semana: 2,
            descripcion: 'Campana',
            dias: {
                ...vacia(),
                JUE: [{ id: 41, codigoParticularCliente: 'P009', nombreCliente: 'KIOSCO NUEVE' }],
            },
        },
    ]

    it('usa el id de la ruta base como id de la card y el día de la columna', () => {
        const [semana] = rutaBaseComoGrid(SEMANAS)

        expect(semana.dias.JUE[0]).toEqual({
            rotacionClienteId: 41,
            codigoParticularCliente: 'P009',
            nombreCliente: 'KIOSCO NUEVE',
            dia: 4,
            estado: 'pendiente',
            esExtra: false,
            eliminado: false,
            ultimoMovimiento: null,
        })
    })

    it('conserva la semana y su zona, y la deja pendiente', () => {
        const [semana] = rutaBaseComoGrid(SEMANAS)

        expect(semana.semana).toBe(2)
        expect(semana.descripcion).toBe('Campana')
        expect(semana.estado).toBe('pendiente')
    })
})
