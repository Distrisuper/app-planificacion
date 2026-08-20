import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaPage from './AnaliticaPage'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica']}>
                <AnaliticaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
})

it('monta un único bloque de Efectividad, con su selector de período', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Efectividad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
})

it('muestra el error si el resumen falla', async () => {
    ;(api.getResumen as any).mockRejectedValue(new Error('boom'))
    montar()
    await waitFor(() => expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument())
})
