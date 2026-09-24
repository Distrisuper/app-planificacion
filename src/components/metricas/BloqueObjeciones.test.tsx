import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import BloqueObjeciones from './BloqueObjeciones'
import * as api from '@/api/metricas'
import { apiClient } from '@/api/apiClient'
import { MOCK_OBJECION_DETALLE, MOCK_OBJECIONES_METRICAS } from '@/mocks/metricasMock'

vi.mock('@/api/metricas')
vi.mock('@/api/apiClient', () => ({ apiClient: { get: vi.fn() } }))

const F = { desde: '2026-09-01', hasta: '2026-09-30' }

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><BloqueObjeciones filtro={F} /></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjecionesMetricas as any).mockResolvedValue(MOCK_OBJECIONES_METRICAS)
    ;(api.getObjecionDetalle as any).mockResolvedValue(MOCK_OBJECION_DETALLE)
    ;(apiClient.get as any).mockResolvedValue({ data: { data: [] } })
})

it('muestra una tarjeta por motivo y la tasa de objeciones', async () => {
    montar()
    expect(await screen.findByRole('button', { name: /Precio/ })).toHaveTextContent('9')
    // 20 / 143 = 14%
    expect(screen.getByTestId('tasa-objeciones')).toHaveTextContent('14%')
})

it('tocar una tarjeta abre el detalle con marcas, rubros y clientes; tocarla de nuevo lo cierra', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Precio/ }))
    const detalle = await screen.findByTestId('detalle-objecion')
    expect(within(detalle).getByText('Nonno Suspension')).toBeInTheDocument()
    expect(within(detalle).getByText('Bosch')).toBeInTheDocument()
    expect(within(detalle).getByText('BUJES')).toBeInTheDocument()
    expect(api.getObjecionDetalle).toHaveBeenCalledWith(F, 1, expect.objectContaining({ pagina: 1, orden: 'nombre' }))

    await userEvent.click(screen.getByRole('button', { name: /Precio/ }))
    expect(screen.queryByTestId('detalle-objecion')).not.toBeInTheDocument()
})

it('ordenar por columna vuelve a pedir con esa orden', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Precio/ }))
    await screen.findByTestId('detalle-objecion')
    await userEvent.click(screen.getByRole('button', { name: /Localidad/ }))
    expect(api.getObjecionDetalle).toHaveBeenLastCalledWith(F, 1, expect.objectContaining({ orden: 'localidad' }))
})

it('sin objeciones muestra un vacío', async () => {
    ;(api.getObjecionesMetricas as any).mockResolvedValue({ total: 0, planificados: 10, motivos: [] })
    montar()
    expect(await screen.findByText('Sin objeciones en este período.')).toBeInTheDocument()
})
