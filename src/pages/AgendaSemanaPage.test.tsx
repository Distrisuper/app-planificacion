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

it('renders clients from the weekly agenda', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Almacén Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    render(wrap(<AgendaSemanaPage />))
    expect(await screen.findByText('Almacén Don José')).toBeInTheDocument()
})

it('closes a visit using the visitaId captured from iniciarVisita, not a separate visitaActiva refetch', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Almacén Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    ;(api.getMotivos as any).mockResolvedValue([{ motivoId: 4, descripcion: 'Precio' }])
    // Deliberately never resolves visitaActiva to a real visit — if AgendaSemanaPage
    // relied on this query's refetch instead of iniciarVisita's own response, cerrar
    // would silently no-op (the bug fixed after Task 18's review).
    ;(api.getVisitaActiva as any).mockResolvedValue(null)
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [] })
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99 })
    ;(api.cerrarVisita as any).mockResolvedValue({ seguimientoPendiente: false })

    render(wrap(<AgendaSemanaPage />))

    await userEvent.click(await screen.findByText('Almacén Don José'))
    await userEvent.click((await screen.findAllByRole('button', { name: /iniciar visita/i }))[1])
    await userEvent.click(await screen.findByText('Precio'))
    await userEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))

    expect(api.cerrarVisita).toHaveBeenCalledWith(99, expect.objectContaining({ motivoIds: [4] }))
})
