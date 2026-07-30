import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaPage from './AnaliticaPage'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar(ruta = '/analitica?desde=2026-07-20&hasta=2026-07-24') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
})

it('muestra la tabla con los vendedores del resumen', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByText('PROMEDIOS')).toBeInTheDocument()
})

it('sin ciclos en el rango muestra un vacío explícito, no un 0%', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        desde: '2020-01-01',
        hasta: '2020-01-05',
        diasHabiles: 5,
        promedios: { ...MOCK_RESUMEN.promedios, cobertura: null },
        vendedores: [],
    })
    montar('/analitica?desde=2020-01-01&hasta=2020-01-05')
    await waitFor(() =>
        expect(screen.getByText(/no hay ciclos entre/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
})

it('muestra el error si el resumen falla', async () => {
    ;(api.getResumen as any).mockRejectedValue(new Error('boom'))
    montar()
    await waitFor(() => expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument())
})

it('el dropdown de vendedores sigue mostrando a todos aunque el filtro deje solo uno', async () => {
    ;(api.getResumen as any).mockImplementation((filtro: { vendedores?: string[] }) => {
        const vendedores = !filtro.vendedores?.length
            ? MOCK_RESUMEN.vendedores
            : MOCK_RESUMEN.vendedores.filter(v => filtro.vendedores!.includes(v.codigoParticularVendedor))
        return Promise.resolve({ ...MOCK_RESUMEN, vendedores })
    })
    montar('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1')
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /vendedores/i }))
    for (const v of MOCK_RESUMEN.vendedores) {
        expect(screen.getByLabelText(v.nombreVendedor)).toBeInTheDocument()
    }
})
