import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import BloqueCategorias from './BloqueCategorias'
import * as api from '@/api/metricas'
import { MOCK_CATEGORIAS, MOCK_CLIENTES_TRAMO } from '@/mocks/metricasMock'

vi.mock('@/api/metricas')

function montar(filtro = { desde: '2026-09-01', hasta: '2026-09-30' }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><BloqueCategorias filtro={filtro} /></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getCategoriasMetricas as any).mockResolvedValue(MOCK_CATEGORIAS)
    ;(api.getClientesDeTramo as any).mockResolvedValue(MOCK_CLIENTES_TRAMO)
})

it('muestra los cinco tramos, subieron/bajaron y el mes', async () => {
    montar()
    expect(await screen.findByRole('button', { name: /Sin compras/ })).toHaveTextContent('210')
    expect(screen.getByText(/32 subieron/)).toBeInTheDocument()
    expect(screen.getByText(/41 bajaron/)).toBeInTheDocument()
    expect(screen.getByText(/Septiembre 2026/)).toBeInTheDocument()
})

it('con un rango que no es el mes completo lo aclara', async () => {
    montar({ desde: '2026-09-07', hasta: '2026-09-11' })
    expect(await screen.findByText(/el mes de la fecha hasta/)).toBeInTheDocument()
})

it('tocar un tramo lista sus clientes con variación', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /> \$5M/ }))
    const tabla = await screen.findByTestId('clientes-tramo')
    expect(within(tabla).getByText('Nonno Suspension')).toBeInTheDocument()
    expect(within(tabla).getByText('-36%')).toBeInTheDocument()
    expect(api.getClientesDeTramo).toHaveBeenCalledWith(expect.any(Object), 'mas5M', { pagina: 1, orden: 'actual', dir: 'desc' })
})
