import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import PropuestaSheet from './PropuestaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

it('shows the rubros returned by the proposal endpoint', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [{ nombre: 'Amortiguadores' }] })
    render(
        wrap(
            <PropuestaSheet open codigoCliente="10034" nombreCliente="Don José" onIniciarVisita={vi.fn()} onClose={vi.fn()} />,
        ),
    )
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})
