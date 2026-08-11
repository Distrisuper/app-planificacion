import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiAdmin from '@/api/planificacionAdmin'
import * as apiAnalitica from '@/api/analitica'
import RutaPage from './RutaPage'

vi.mock('@/api/planificacionAdmin')
vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Jefa', rol: 'admin' }, logout: vi.fn() }),
}))

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica/ruta']}>
                <RutaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiAnalitica.getVendedores).mockResolvedValue([
        { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    ])
})

describe('RutaPage', () => {
    it('sin vendedor elegido no pide ninguna rotación', async () => {
        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        expect(apiAdmin.getRotaciones).not.toHaveBeenCalled()
    })

    it('pide la cola del vendedor recién elegido', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([])
        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })

        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        expect(apiAdmin.getRotaciones).toHaveBeenCalledWith('V 2')
    })

    it('invita a elegir un vendedor mientras no haya ninguno', async () => {
        renderPage()
        // Regex más específico que "/elegí un vendedor/i": ese matchea también la opción
        // placeholder del <select> ("Elegí un vendedor…"), lo que da "multiple elements".
        expect(
            await screen.findByText(/elegí un vendedor para ver y editar su ruta/i),
        ).toBeInTheDocument()
    })

    it('muestra los chips de la cola y preselecciona la rotación vigente', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
            {
                id: 30,
                codigoParticularVendedor: 'V 2',
                estado: 'programada',
                fechaInicio: null,
                fechaFin: null,
                descripcion: null,
                orden: 1,
            },
        ])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
            semanas: [],
        })

        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        expect(await screen.findByRole('button', { name: /Ronda Agosto/ })).toBeInTheDocument()
        // Nombre exacto: "Cancelar Programada #1" también matchea la regex /Programada #1/
        // como substring (ver la misma nota en ColaRotaciones.test.tsx).
        expect(screen.getByRole('button', { name: 'Programada #1' })).toBeInTheDocument()
    })
})
