import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useOfrecimientos, useResolverOfrecimientos } from './useOfrecimientos'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('useOfrecimientos no consulta sin visitaId', async () => {
    const { result } = renderHook(() => useOfrecimientos(null), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getOfrecimientos).not.toHaveBeenCalled()
})

it('useOfrecimientos trae los ofrecimientos congelados de la visita', async () => {
    ;(api.getOfrecimientos as any).mockResolvedValue([{ id: 1, codigo: 'AMORT' }])
    const { result } = renderHook(() => useOfrecimientos(42), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getOfrecimientos).toHaveBeenCalledWith(42)
    expect(result.current.data).toHaveLength(1)
})

it('useResolverOfrecimientos manda un PUT por ofrecimiento y devuelve error null si todos guardan', async () => {
    ;(api.resolverOfrecimiento as any).mockResolvedValue({ ofrecimientosPendientes: 0 })
    const { result } = renderHook(() => useResolverOfrecimientos(42), { wrapper })
    const items = [
        { ofrecimientoId: 7, motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }] },
        { ofrecimientoId: 8, motivos: [{ motivoId: 16, marca: null, competidor: null, pctDiferencia: null }] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(api.resolverOfrecimiento).toHaveBeenCalledWith(42, 7, { motivos: items[0].motivos })
    expect(api.resolverOfrecimiento).toHaveBeenCalledWith(42, 8, { motivos: items[1].motivos })
    expect(out).toEqual([
        { ofrecimientoId: 7, error: null },
        { ofrecimientoId: 8, error: null },
    ])
})

it('un fallo no descarta los que sí guardaron', async () => {
    ;(api.resolverOfrecimiento as any).mockImplementation(
        (_visitaId: number, ofrecimientoId: number) =>
            ofrecimientoId === 8
                ? Promise.reject(new Error('Network Error'))
                : Promise.resolve({ ofrecimientosPendientes: 0 }),
    )
    const { result } = renderHook(() => useResolverOfrecimientos(42), { wrapper })
    const items = [
        { ofrecimientoId: 7, motivos: [] },
        { ofrecimientoId: 8, motivos: [] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(out).toEqual([
        { ofrecimientoId: 7, error: null },
        { ofrecimientoId: 8, error: 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.' },
    ])
})

// Un 400 del servidor NO es un problema de red: reintentar no lo arregla nunca. Decirle
// "Sin conexión" al vendedor lo manda a un loop de reintentos inútil, y encima le esconde
// que el problema está en lo que cargó.
it('un rechazo del servidor no se reporta como falta de conexión', async () => {
    ;(api.resolverOfrecimiento as any).mockRejectedValue({
        response: { data: { code: 'MOTIVO_INEXISTENTE' } },
    })
    const { result } = renderHook(() => useResolverOfrecimientos(42), { wrapper })

    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync([{ ofrecimientoId: 7, motivos: [] }])
    })

    expect(out[0].error).not.toMatch(/sin conexión/i)
    expect(out[0].error).toMatch(/rechazó/i)
})
