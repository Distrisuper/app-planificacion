import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

it('opens the resolución sheet for no-visita and calls the API', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    ;(api.getMotivos as any).mockResolvedValue([{ motivoId: 9, descripcion: 'Vacaciones' }])
    ;(api.getVisitaActiva as any).mockResolvedValue(null)
    ;(api.registrarNoVisita as any).mockResolvedValue({ visitaId: 77, seguimientoPendiente: false })

    render(wrap(<AgendaSemanaPage />))
    await userEvent.click(await screen.findByRole('button', { name: /reagendar \/ no visito/i }))
    await userEvent.click(await screen.findByText('Vacaciones'))
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))
    expect(api.registrarNoVisita).toHaveBeenCalledWith(
        expect.objectContaining({ codigoParticularCliente: '1', motivoIds: [9] }),
    )
})
