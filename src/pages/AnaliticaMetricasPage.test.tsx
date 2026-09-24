import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaMetricasPage from './AnaliticaMetricasPage'
import * as api from '@/api/metricas'
import {
    MOCK_CATEGORIAS, MOCK_OBJECIONES_METRICAS, MOCK_OPCIONES, MOCK_RESUMEN_METRICAS,
} from '@/mocks/metricasMock'

vi.mock('@/api/metricas')
vi.mock('@/api/apiClient', () => ({ apiClient: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Gerencia' }, logout: vi.fn() }) }))
vi.mock('@/hooks/useAccionesDeCuenta', () => ({ useAccionesDeCuenta: () => [] }))

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica/metricas']}>
                <AnaliticaMetricasPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumenMetricas as any).mockResolvedValue(MOCK_RESUMEN_METRICAS)
    ;(api.getObjecionesMetricas as any).mockResolvedValue(MOCK_OBJECIONES_METRICAS)
    ;(api.getCategoriasMetricas as any).mockResolvedValue(MOCK_CATEGORIAS)
    ;(api.getOpcionesMetricas as any).mockResolvedValue(MOCK_OPCIONES)
})

it('carga los cuatro bloques con el mes en curso', async () => {
    montar()
    expect(await screen.findByText('Métricas de ventas')).toBeInTheDocument()
    expect(await screen.findByText('Ranking por vendedor')).toBeInTheDocument()
    expect(screen.getByText('Métricas de objeciones')).toBeInTheDocument()
    expect(screen.getByText('Clientes por categoría')).toBeInTheDocument()
    const f = (api.getResumenMetricas as any).mock.calls[0][0]
    expect(f.desde).toMatch(/^\d{4}-\d{2}-01$/)
})

it('elegir una sucursal vuelve a pedir los bloques con ese filtro', async () => {
    montar()
    await screen.findByText('Ranking por vendedor')
    await userEvent.selectOptions(await screen.findByLabelText('Sucursal'), 'MDP')
    await waitFor(() =>
        expect(api.getResumenMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ sucursal: 'MDP' })),
    )
    expect(api.getCategoriasMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ sucursal: 'MDP' }))
})

it('tocar una fila del ranking elige al vendedor en el filtro', async () => {
    montar()
    // El nombre también está en el select de vendedor: se toca la celda del ranking.
    await userEvent.click(await screen.findByRole('cell', { name: 'GOMEZ SERGIO' }))
    expect(screen.getByLabelText('Vendedor')).toHaveValue('V 5')
    await waitFor(() =>
        expect(api.getObjecionesMetricas).toHaveBeenLastCalledWith(expect.objectContaining({ vendedor: 'V 5' }), undefined),
    )
})
