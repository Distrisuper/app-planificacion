import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useAgendaSemana, useAgendaDia } from './useAgenda'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

beforeEach(() => {
    vi.clearAllMocks()
})

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useAgendaSemana returns the weekly agenda', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'A' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    const { result } = renderHook(() => useAgendaSemana(true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.LUN).toHaveLength(1)
})

it('useAgendaSemana no consulta sin vuelta abierta', async () => {
    const { result } = renderHook(() => useAgendaSemana(false), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getAgendaSemana).not.toHaveBeenCalled()
})

it('useAgendaDia returns the daily agenda for the given dia', async () => {
    ;(api.getAgendaDia as any).mockResolvedValue([
        { codigoParticularCliente: '2', nombreCliente: 'B', visit: 's1d1', resuelto: false },
    ])
    const { result } = renderHook(() => useAgendaDia('LUN'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getAgendaDia).toHaveBeenCalledWith('LUN')
    expect(result.current.data).toHaveLength(1)
})

it('useAgendaDia does not fetch when enabled is false', async () => {
    const { result } = renderHook(() => useAgendaDia('LUN', false), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.getAgendaDia).not.toHaveBeenCalled()
})
