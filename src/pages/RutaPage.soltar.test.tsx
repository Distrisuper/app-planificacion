import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiAdmin from '@/api/planificacionAdmin'
import * as apiAnalitica from '@/api/analitica'
import RutaPage from './RutaPage'

/**
 * Soltar una card es un arrastre de dnd-kit, que jsdom no puede simular (no hay layout).
 * Acá el grid se reemplaza por un botón que dispara el mismo `onMover` que el drop, para
 * probar lo que hace la PÁGINA con ese movimiento: preguntar el alcance y mandarlo.
 */
vi.mock('@/components/ruta/GridRotacion', () => ({
    default: ({
        onMover,
        onQuitar,
    }: {
        onMover: (id: number, semana: number, dia: number, posicion?: number) => void
        onQuitar?: (id: number) => void
    }) => (
        <>
            <button type="button" onClick={() => onMover(11, 2, 4)}>
                Soltar la card
            </button>
            {/* Una visita de la Ruta sin fila en una semana que viene: id negativo (back #324). */}
            <button type="button" onClick={() => onMover(-400231, 2, 4)}>
                Soltar la card de la Ruta
            </button>
            <button type="button" onClick={() => onQuitar?.(-400231)}>
                Quitar la card de la Ruta
            </button>
            {/* Soltar sobre otra card: el grid que ordena manda también el lugar. */}
            <button type="button" onClick={() => onMover(11, 2, 4, 0)}>
                Soltar sobre otra card
            </button>
        </>
    ),
}))
vi.mock('@/api/planificacionAdmin')
vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { name: 'Jefa', rol: 'admin' },
        logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
        vendedoresVisibles: null,
        vendedorDePrueba: null,
    }),
}))

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiAnalitica.getVendedores).mockResolvedValue([
        { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    ])
    const rotacion = {
        id: 7,
        codigoParticularVendedor: 'V 2',
        estado: 'abierta' as const,
        fechaInicio: '2026-09-01T12:00:00.000Z',
        fechaFin: null,
        descripcion: 'Ronda Septiembre',
        orden: null,
    }
    vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([rotacion])
    vi.mocked(apiAdmin.getRotacion).mockResolvedValue({ ...rotacion, semanas: [] })
})

async function soltarCard(boton = 'Soltar la card') {
    await abrirVuelta()
    await userEvent.click(await screen.findByRole('button', { name: boton }))
}

async function abrirVuelta() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <RutaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Juan Pérez' }))
    await screen.findByRole('button', { name: 'Soltar la card' })
    await waitFor(() => expect(apiAdmin.getRotacion).toHaveBeenCalled())
}

const VENCIDA = { response: { status: 409, data: { code: 'VISITA_VIRTUAL_VENCIDA' } } }

describe('RutaPage — visitas de la Ruta sin fila (id negativo)', () => {
    it('mover manda el id negativo tal cual a reacomodar', async () => {
        vi.mocked(apiAdmin.reacomodarAdmin).mockResolvedValue({ rutaBase: null })
        await soltarCard('Soltar la card de la Ruta')

        await userEvent.click(await screen.findByRole('button', { name: 'Solo esta vuelta' }))

        await waitFor(() =>
            expect(apiAdmin.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, -400231, {
                semana: 2,
                dia: 4,
                aplicarARutaBase: false,
            }),
        )
    })

    it('si la visita cambió desde que se leyó (409), lo explica y relee la vuelta', async () => {
        vi.mocked(apiAdmin.reacomodarAdmin).mockRejectedValue(VENCIDA)
        await soltarCard('Soltar la card de la Ruta')
        await waitFor(() => expect(apiAdmin.getRotacion).toHaveBeenCalled())
        const lecturas = vi.mocked(apiAdmin.getRotacion).mock.calls.length

        await userEvent.click(await screen.findByRole('button', { name: 'Solo esta vuelta' }))

        expect(await screen.findByText(/esa visita cambió/i)).toBeInTheDocument()
        await waitFor(() =>
            expect(vi.mocked(apiAdmin.getRotacion).mock.calls.length).toBeGreaterThan(lecturas),
        )
    })

    it('quitar con 409 de visita vencida lo explica y relee la vuelta', async () => {
        vi.mocked(apiAdmin.quitarClienteAdmin).mockRejectedValue(VENCIDA)
        await abrirVuelta()
        const lecturas = vi.mocked(apiAdmin.getRotacion).mock.calls.length

        await userEvent.click(screen.getByRole('button', { name: 'Quitar la card de la Ruta' }))

        expect(apiAdmin.quitarClienteAdmin).toHaveBeenCalledWith('V 2', 7, -400231)
        expect(await screen.findByText(/esa visita cambió/i)).toBeInTheDocument()
        await waitFor(() =>
            expect(vi.mocked(apiAdmin.getRotacion).mock.calls.length).toBeGreaterThan(lecturas),
        )
    })
})

describe('RutaPage — soltar una card en la vuelta', () => {
    it('pregunta el alcance antes de mover, y manda la elección', async () => {
        vi.mocked(apiAdmin.reacomodarAdmin).mockResolvedValue({ rutaBase: 'aplicado' })
        await soltarCard()

        expect(apiAdmin.reacomodarAdmin).not.toHaveBeenCalled()
        await userEvent.click(await screen.findByRole('button', { name: 'Esta vuelta y la ruta base' }))

        await waitFor(() =>
            expect(apiAdmin.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, 11, {
                semana: 2,
                dia: 4,
                aplicarARutaBase: true,
            }),
        )
    })

    it('"Solo esta vuelta" manda aplicarARutaBase en false', async () => {
        vi.mocked(apiAdmin.reacomodarAdmin).mockResolvedValue({ rutaBase: null })
        await soltarCard()

        await userEvent.click(await screen.findByRole('button', { name: 'Solo esta vuelta' }))

        await waitFor(() =>
            expect(apiAdmin.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, 11, {
                semana: 2,
                dia: 4,
                aplicarARutaBase: false,
            }),
        )
    })

    it('Cancelar no mueve nada', async () => {
        await soltarCard()

        await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

        expect(apiAdmin.reacomodarAdmin).not.toHaveBeenCalled()
    })

    it('si en la ruta base no estaba en esa celda, avisa que se movió solo en la vuelta', async () => {
        vi.mocked(apiAdmin.reacomodarAdmin).mockResolvedValue({ rutaBase: 'no_estaba' })
        await soltarCard()

        await userEvent.click(await screen.findByRole('button', { name: 'Esta vuelta y la ruta base' }))

        expect(
            await screen.findByText(
                'En la ruta base ese cliente no estaba en esa celda: se movió solo en esta vuelta.',
            ),
        ).toBeInTheDocument()
    })
})

describe('RutaPage — soltar una card en la ruta base', () => {
    it('manda el lugar dentro del día, sin preguntar el alcance', async () => {
        vi.mocked(apiAdmin.getRutaBase).mockResolvedValue({
            semanas: [
                { semana: 1, descripcion: null, dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] } },
            ],
            omitidos: [],
        })
        vi.mocked(apiAdmin.moverEnRutaBase).mockResolvedValue(undefined)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <MemoryRouter>
                    <RutaPage />
                </MemoryRouter>
            </QueryClientProvider>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        await userEvent.click(await screen.findByRole('option', { name: 'Juan Pérez' }))
        await userEvent.click(screen.getByRole('button', { name: 'Ruta base' }))

        await userEvent.click(await screen.findByRole('button', { name: 'Soltar sobre otra card' }))

        await waitFor(() =>
            expect(apiAdmin.moverEnRutaBase).toHaveBeenCalledWith('V 2', 11, {
                semana: 2,
                dia: 4,
                posicion: 0,
            }),
        )
        expect(screen.queryByRole('button', { name: 'Solo esta vuelta' })).not.toBeInTheDocument()
    })
})
