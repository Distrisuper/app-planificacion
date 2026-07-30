import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useRubros, useResolverRubros } from './useRubros'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('useRubros no consulta sin visitaId', async () => {
    const { result } = renderHook(() => useRubros(null), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getRubros).not.toHaveBeenCalled()
})

it('useRubros trae los rubros congelados de la visita', async () => {
    ;(api.getRubros as any).mockResolvedValue([{ id: 1, rubroCode: 'AMORT' }])
    const { result } = renderHook(() => useRubros(42), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getRubros).toHaveBeenCalledWith(42)
    expect(result.current.data).toHaveLength(1)
})

it('useResolverRubros manda un PUT por rubro y devuelve error null si todos guardan', async () => {
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
    const { result } = renderHook(() => useResolverRubros(42), { wrapper })
    const items = [
        { rubroId: 7, motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }] },
        { rubroId: 8, motivos: [{ motivoId: 16, marca: null, competidor: null, pctDiferencia: null }] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, { motivos: items[0].motivos })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 8, { motivos: items[1].motivos })
    expect(out).toEqual([
        { rubroId: 7, error: null },
        { rubroId: 8, error: null },
    ])
})

it('un fallo no descarta los que sí guardaron', async () => {
    ;(api.resolverRubro as any).mockImplementation((_visitaId: number, rubroId: number) =>
        rubroId === 8
            ? Promise.reject(new Error('Network Error'))
            : Promise.resolve({ rubrosPendientes: 0 }),
    )
    const { result } = renderHook(() => useResolverRubros(42), { wrapper })
    const items = [
        { rubroId: 7, motivos: [] },
        { rubroId: 8, motivos: [] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(out).toEqual([
        { rubroId: 7, error: null },
        { rubroId: 8, error: 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.' },
    ])
})
