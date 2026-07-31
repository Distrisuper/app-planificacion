import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import AgregarRubroVista from './AgregarRubroVista'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function renderVista(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onVolver = vi.fn()
    const onAgregado = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <AgregarRubroVista
                visitaId={42}
                codesEnVisita={['AMORT']}
                onVolver={onVolver}
                onAgregado={onAgregado}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onVolver, onAgregado }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'AMORT', description: 'Amortiguadores' },
        { code: 'FILT', description: 'Filtros' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
})

it('no ofrece los rubros que ya están en la visita', async () => {
    renderVista()
    expect(await screen.findByText('Filtros')).toBeInTheDocument()
    // El backend no deduplica: dos "Amortiguadores" serían dos pendientes distintos.
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

it('agrega el rubro elegido y vuelve a la lista', async () => {
    const { onAgregado } = renderVista()
    fireEvent.click(await screen.findByText('Filtros'))
    await waitFor(() =>
        expect(api.agregarRubro).toHaveBeenCalledWith(42, {
            rubroCode: 'FILT',
            rubroDescripcion: 'Filtros',
        }),
    )
    expect(onAgregado).toHaveBeenCalled()
})

it('si falla muestra el error y no cierra la vista', async () => {
    ;(api.agregarRubro as any).mockRejectedValue(new Error('offline'))
    const { onAgregado } = renderVista()
    fireEvent.click(await screen.findByText('Filtros'))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(onAgregado).not.toHaveBeenCalled()
})
