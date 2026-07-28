import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import CerrarSemanaSheet from './CerrarSemanaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function renderSheet(onCerrado = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <CerrarSemanaSheet open onClose={() => {}} onCerrado={onCerrado} />
        </QueryClientProvider>,
    )
    return { onCerrado }
}

beforeEach(() => vi.clearAllMocks())

it('cierra la semana cuando no queda nada pendiente', async () => {
    ;(api.cerrarCiclo as any).mockResolvedValue({
        cerrado: true, clientesPendientes: [], visitasConRubrosPendientes: [],
    })
    const { onCerrado } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))
    await waitFor(() => expect(onCerrado).toHaveBeenCalled())
})

it('lee las dos listas del 409, que vienen en data pese al ok:0', async () => {
    // Es el ÚNICO endpoint con esta forma irregular: ok:0 con payload en `data`,
    // no un error con `code`.
    ;(api.cerrarCiclo as any).mockRejectedValue({
        response: {
            status: 409,
            data: {
                ok: 0,
                data: {
                    cerrado: false,
                    clientesPendientes: ['10034', '10099'],
                    visitasConRubrosPendientes: [
                        { visitaId: 7, codigoParticularCliente: '10100', rubros: 2 },
                    ],
                },
            },
        },
    })
    const { onCerrado } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))

    expect(await screen.findByText(/2 clientes sin resolver/i)).toBeInTheDocument()
    expect(screen.getByText(/1 visita con rubros sin cargar/i)).toBeInTheDocument()
    expect(onCerrado).not.toHaveBeenCalled()
})

it('un error de red no se confunde con pendientes', async () => {
    ;(api.cerrarCiclo as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar semana/i }))
    expect(await screen.findByText(/no se pudo/i)).toBeInTheDocument()
})
