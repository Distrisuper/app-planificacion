import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useMotivos } from './useMotivos'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

beforeEach(() => vi.clearAllMocks())

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useMotivos returns the motivos catalog', async () => {
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 1, descripcion: 'Saqué pedido', campos: [] },
    ])
    const { result } = renderHook(() => useMotivos(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(api.getMotivos).toHaveBeenCalledWith(undefined)
})

it('useMotivos manda el nivel a la API y lo incluye en la key', async () => {
    ;(api.getMotivos as any).mockResolvedValue([
        { motivoId: 2, descripcion: 'Precio', nivel: 'ofrecimiento', campos: [] },
    ])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useMotivos('ofrecimiento'), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getMotivos).toHaveBeenCalledWith('ofrecimiento')
    expect(qc.getQueryData(['motivos', 'ofrecimiento'])).toEqual(result.current.data)
})
