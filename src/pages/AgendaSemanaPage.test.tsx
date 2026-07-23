import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AgendaSemanaPage from './AgendaSemanaPage'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
}

it('renders clients from the weekly agenda', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Almacén Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    render(wrap(<AgendaSemanaPage />))
    expect(await screen.findByText('Almacén Don José')).toBeInTheDocument()
})
