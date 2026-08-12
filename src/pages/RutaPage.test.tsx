import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

        // Nombres exactos: la card activa también tiene un botón "Nombrar Ronda Agosto"
        // (DescripcionInline) y "Cancelar Programada #1" que colisionan por substring con
        // estas regexes (ver la misma nota en ColaRotaciones.test.tsx).
        expect(await screen.findByRole('button', { name: 'Ronda Agosto' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Programada #1' })).toBeInTheDocument()
    })

    it('al cancelar la rotación elegida vuelve a la vigente, sin pedir el id muerto', async () => {
        const vigente = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
        }
        const programada = {
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada' as const,
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: 1,
        }
        // Después de cancelar, la cola ya no trae la #30: es el estado que deja el backend.
        vi.mocked(apiAdmin.getRotaciones)
            .mockResolvedValueOnce([vigente, programada])
            .mockResolvedValue([vigente])
        vi.mocked(apiAdmin.getRotacion).mockImplementation(async (_codigo, rotacionId) => ({
            ...vigente,
            id: rotacionId,
            semanas: [],
        }))
        vi.mocked(apiAdmin.cancelarRotacion).mockResolvedValue(undefined)
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)

        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        await userEvent.click(await screen.findByRole('button', { name: 'Programada #1' }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar Programada #1' }))

        // El id 30 ya no existe: seguir pidiéndolo devuelve 404 y deja el grid en blanco.
        await screen.findByRole('button', { name: 'Ronda Agosto' })
        expect(apiAdmin.getRotacion).toHaveBeenLastCalledWith('V 2', 7)

        confirmar.mockRestore()
    })

    it('cambiar de rotación desarma el intercambio a medio hacer', async () => {
        const vigente = {
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta' as const,
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
        }
        const programada = {
            id: 30,
            codigoParticularVendedor: 'V 2',
            estado: 'programada' as const,
            fechaInicio: null,
            fechaFin: null,
            descripcion: 'Ronda Septiembre',
            orden: 1,
        }
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([vigente, programada])
        const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }
        vi.mocked(apiAdmin.getRotacion).mockImplementation(async (_codigo, rotacionId) => ({
            ...vigente,
            id: rotacionId,
            semanas: [{ semana: 1, descripcion: null, dias: semanaVacia }],
        }))

        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        // Primero se visitan las DOS rotaciones para dejarlas en caché. Es lo que hace que
        // el bug sea alcanzable: con la rotación destino ya cacheada, React Query entrega
        // `data` en el mismo render y `GridRotacion` nunca se desmonta — sin caché hay un
        // hueco con `grid` undefined que limpia el estado por accidente y tapa el problema.
        await screen.findByRole('button', { name: 'Ronda Agosto' })
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Septiembre' }))
        await screen.findByRole('button', { name: 'Intercambiar este día: semana 1, LUN' })
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Agosto' }))

        // Se arma un intercambio en la rotación vigente…
        await userEvent.click(
            await screen.findByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        ).toBeInTheDocument()

        // …y sin confirmarlo se pasa a la otra rotación, que ahora sí está cacheada.
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Septiembre' }))

        // El origen viejo no puede seguir armado: tocar otra celda permutaría los clientes
        // de la rotación nueva contra una celda de la anterior, sin confirmación.
        await waitFor(() => {
            expect(
                screen.queryByRole('button', { name: /^Cancelar intercambio/ }),
            ).not.toBeInTheDocument()
        })
        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, MAR' }),
        )
        expect(apiAdmin.intercambiarDias).not.toHaveBeenCalled()
    })

    it('avisa cuando el grid de la rotación no se pudo cargar', async () => {
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
        ])
        vi.mocked(apiAdmin.getRotacion).mockRejectedValue(new Error('404'))

        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        expect(await screen.findByText(/no se pudo cargar el plan/i)).toBeInTheDocument()
    })
})
