import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GridRotacion, { movimientoDeDrop, parsearCelda } from './GridRotacion'
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
                    ofrecimientosPendientes: 0,
                    ultimoMovimiento: null,
                },
            ] as never,
        },
    },
    { semana: 3, descripcion: null, dias: vacia() },
]

describe('GridRotacion', () => {
    it('rotula cada semana con su número y su zona', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(screen.getByText(/Zona Norte/)).toBeInTheDocument()
    })

    it('muestra las semanas vacías del set, no solo las que tienen clientes', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        // La semana 3 existe en el set y no tiene ni un cliente: tiene que estar igual,
        // porque es una celda válida para soltarle una card encima.
        expect(screen.getByText(/Semana 3/)).toBeInTheDocument()
    })

    it('encabeza las cinco columnas de días', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        for (const dia of ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']) {
            expect(screen.getByText(dia)).toBeInTheDocument()
        }
    })

    it('pone cada cliente en la celda de su día', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        const celda = screen.getByTestId('celda-1-LUN')
        expect(celda).toContainElement(screen.getByTestId('card-cliente-11'))
    })
})

/** Dónde está hoy cada fila, como lo resolvería el grid a partir de sus semanas. */
const origenDe = (id: number) => (id === 11 ? { semana: 1, dia: 1 } : undefined)

describe('movimientoDeDrop', () => {
    it('traduce el drop a la fila y el destino', () => {
        expect(movimientoDeDrop('card-11', 'celda-3-JUE', origenDe)).toEqual({
            rotacionClienteId: 11,
            semana: 3,
            dia: 4,
        })
    })

    it('soltar en la misma celda no es un movimiento', () => {
        // Sin esto, cancelar un arrastre devolviendo la card a su lugar generaría un PATCH
        // y una fila de bitácora por cada intento.
        expect(movimientoDeDrop('card-11', 'celda-1-LUN', origenDe)).toBeNull()
    })

    it('soltar afuera de toda celda no es un movimiento', () => {
        expect(movimientoDeDrop('card-11', null, origenDe)).toBeNull()
    })

    it('ignora ids que no son de una card o de una celda', () => {
        expect(movimientoDeDrop('otra-cosa', 'celda-3-JUE', origenDe)).toBeNull()
        expect(movimientoDeDrop('card-11', 'header-LUN', origenDe)).toBeNull()
    })
})

describe('parsearCelda', () => {
    it('mapea cada día a su índice 1..5', () => {
        expect(parsearCelda('celda-2-LUN')).toEqual({ semana: 2, dia: 1 })
        expect(parsearCelda('celda-2-VIE')).toEqual({ semana: 2, dia: 5 })
    })

    it('null si el id no es de una celda', () => {
        expect(parsearCelda('card-11')).toBeNull()
    })
})

describe('intercambiar días', () => {
    const props = () => ({
        semanas: SEMANAS,
        onMover: vi.fn(),
        onRenombrarSemana: vi.fn(),
        onIntercambiar: vi.fn(),
    })

    it('cada celda ofrece iniciar un intercambio', () => {
        render(<GridRotacion {...props()} />)
        // 2 semanas × 5 días
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('al elegir el origen, las demás celdas pasan a ser destino', async () => {
        render(<GridRotacion {...props()} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )

        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        ).toBeInTheDocument()
        expect(
            screen.getAllByRole('button', { name: /intercambiar con este día/i }),
        ).toHaveLength(9)
    })

    it('el segundo click avisa las dos celdas y sale del modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Intercambiar con este día: semana 3, JUE',
            }),
        )

        // Entre semanas distintas: es el caso que un menú por columna no cubriría.
        expect(p.onIntercambiar).toHaveBeenCalledWith(
            { semana: 1, dia: 1 },
            { semana: 3, dia: 4 },
        )
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('volver a tocar el origen cancela', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        )

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('Escape cancela el modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.keyboard('{Escape}')

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('sin editable no se ofrece intercambiar', () => {
        render(<GridRotacion {...props()} editable={false} />)
        expect(
            screen.queryByRole('button', { name: /intercambiar este día/i }),
        ).not.toBeInTheDocument()
    })
})
