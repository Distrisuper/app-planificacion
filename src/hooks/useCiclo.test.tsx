import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useCicloActual, useCicloPreview, useAbrirCiclo, useReagendar } from './useCiclo'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('useCicloActual expone null cuando no hay vuelta abierta', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    const { result } = renderHook(() => useCicloActual(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
})

it('useCicloPreview no consulta hasta tener una semana o habilitación explícita', async () => {
    ;(api.getCicloPreview as any).mockResolvedValue({ semana: 3, dias: {} })
    const { result } = renderHook(() => useCicloPreview(undefined, false), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getCicloPreview).not.toHaveBeenCalled()
})

it('useCicloPreview pide la semana indicada', async () => {
    ;(api.getCicloPreview as any).mockResolvedValue({ semana: 4, dias: {} })
    const { result } = renderHook(() => useCicloPreview(4, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getCicloPreview).toHaveBeenCalledWith(4)
})

it('useAbrirCiclo pasa la semana elegida', async () => {
    ;(api.abrirCiclo as any).mockResolvedValue({ cicloId: 1, semana: 3, clientes: 39, omitidos: [] })
    const { result } = renderHook(() => useAbrirCiclo(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(3)
    })
    expect(api.abrirCiclo).toHaveBeenCalledWith(3)
    expect(out.clientes).toBe(39)
})

it('useReagendar manda cicloClienteId y día', async () => {
    ;(api.reagendarCicloCliente as any).mockResolvedValue(undefined)
    const { result } = renderHook(() => useReagendar(), { wrapper })
    await waitFor(async () => {
        await result.current.mutateAsync({ cicloClienteId: 42, dia: 3 })
    })
    expect(api.reagendarCicloCliente).toHaveBeenCalledWith(42, 3)
})
