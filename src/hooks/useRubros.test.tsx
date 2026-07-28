import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useRubros, useResolverRubro } from './useRubros'
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

it('useResolverRubro manda los motivos del rubro', async () => {
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 2 })
    const { result } = renderHook(() => useResolverRubro(42), { wrapper })
    const motivos = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({ rubroId: 7, motivos })
    })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, { motivos })
    expect(out.rubrosPendientes).toBe(2)
})
