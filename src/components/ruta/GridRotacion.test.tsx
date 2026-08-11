import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GridRotacion from './GridRotacion'
import type { ISemanaRotacionAdmin } from '@/types/planificacion'

const vacia = () => ({ LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] })

const SEMANAS: ISemanaRotacionAdmin[] = [
    {
        semana: 1,
        descripcion: 'Zona Norte',
        dias: {
            ...vacia(),
            LUN: [
                {
                    rotacionClienteId: 11,
                    codigoParticularCliente: 'P001',
                    nombreCliente: 'Kiosco Uno',
                    dia: 1,
                    estado: 'pendiente',
                    visitaId: null,
                    rubrosPendientes: 0,
                    ultimoMovimiento: null,
                },
            ] as never,
        },
    },
    { semana: 3, descripcion: null, dias: vacia() },
]

describe('GridRotacion', () => {
    it('rotula cada semana con su número y su zona', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(screen.getByText(/Zona Norte/)).toBeInTheDocument()
    })

    it('muestra las semanas vacías del set, no solo las que tienen clientes', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        // La semana 3 existe en el set y no tiene ni un cliente: tiene que estar igual,
        // porque es una celda válida para soltarle una card encima.
        expect(screen.getByText(/Semana 3/)).toBeInTheDocument()
    })

    it('encabeza las cinco columnas de días', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        for (const dia of ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']) {
            expect(screen.getByText(dia)).toBeInTheDocument()
        }
    })

    it('pone cada cliente en la celda de su día', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        const celda = screen.getByTestId('celda-1-LUN')
        expect(celda).toContainElement(screen.getByTestId('card-cliente-11'))
    })
})
