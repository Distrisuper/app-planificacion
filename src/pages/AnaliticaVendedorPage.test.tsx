import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaVendedorPage from './AnaliticaVendedorPage'
import { MOCK_RESUMEN, MOCK_VISITAS } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

function montar(codigo = 'V1') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter
                initialEntries={[`/analitica/vendedor/${codigo}?desde=2026-07-20&hasta=2026-07-24`]}
            >
                <Routes>
                    <Route
                        path="/analitica/vendedor/:codigo"
                        element={<AnaliticaVendedorPage />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
})

it('muestra el nombre del vendedor y sus visitas', async () => {
    ;(api.getVisitas as any).mockResolvedValue({
        total: MOCK_VISITAS['V1'].length,
        pagina: 1,
        cant: MOCK_VISITAS['V1'].length,
        visitas: MOCK_VISITAS['V1'],
    })
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
})

it('pide las visitas del vendedor de la URL con el rango de la query', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar('V4')
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    expect(api.getVisitas).toHaveBeenCalledWith(
        expect.objectContaining({ vendedor: 'V4', desde: '2026-07-20', hasta: '2026-07-24' }),
    )
})

it('sin visitas en el rango muestra un vacío explícito', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByText(/sin visitas en este rango/i)).toBeInTheDocument())
})

it('ofrece volver al nivel 1 conservando el rango', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute(
        'href',
        '/analitica?desde=2026-07-20&hasta=2026-07-24',
    )
})
