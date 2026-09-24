import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useVisitaTimer } from './useVisitaTimer'
import { marcarInicioVisita, segundosTranscurridos } from '@/lib/visitaTimer'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
})

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const haceMinutos = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

it('sin inicio local (cerró sesión, 401, otro dispositivo), cuenta desde el fechaInicio del servidor', async () => {
    ;(api.getVisitaActiva as any).mockResolvedValue({ id: 7, fechaInicio: haceMinutos(5) })

    const { result } = renderHook(() => useVisitaTimer(7), { wrapper })

    await waitFor(() => expect(result.current).toBeGreaterThanOrEqual(300))
    expect(result.current).toBeLessThan(305)
    // Queda anclado localmente: una recarga sin señal sigue contando desde ahí.
    expect(segundosTranscurridos(7)).toBeGreaterThanOrEqual(300)
})

it('el servidor gana sobre un inicio local distinto', async () => {
    marcarInicioVisita(7) // "recién": 0 s
    ;(api.getVisitaActiva as any).mockResolvedValue({ id: 7, fechaInicio: haceMinutos(20) })

    const { result } = renderHook(() => useVisitaTimer(7), { wrapper })

    await waitFor(() => expect(result.current).toBeGreaterThanOrEqual(1200))
})

it('si la activa del servidor es OTRA visita, no la usa', async () => {
    marcarInicioVisita(7)
    ;(api.getVisitaActiva as any).mockResolvedValue({ id: 99, fechaInicio: haceMinutos(20) })

    const { result } = renderHook(() => useVisitaTimer(7), { wrapper })

    await waitFor(() => expect(api.getVisitaActiva).toHaveBeenCalled())
    expect(result.current).toBeLessThan(5)
})

it('sin señal, sigue con el inicio local', async () => {
    marcarInicioVisita(7)
    ;(api.getVisitaActiva as any).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useVisitaTimer(7), { wrapper })

    await waitFor(() => expect(api.getVisitaActiva).toHaveBeenCalled())
    expect(result.current).toBeLessThan(5)
})
