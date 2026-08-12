import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useIniciarVisita, useCerrarVisita, useNoVisita } from './useVisitas'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

beforeEach(() => vi.clearAllMocks())

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useIniciarVisita calls the API with rotacionClienteId/coordInicio and returns the visitaId', async () => {
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 42, rubros: 3 })
    const { result } = renderHook(() => useIniciarVisita(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({
            rotacionClienteId: 10034,
            coordInicio: '-34.6,-58.6',
        })
    })
    expect(api.iniciarVisita).toHaveBeenCalledWith({
        rotacionClienteId: 10034,
        coordInicio: '-34.6,-58.6',
    })
    expect(out.visitaId).toBe(42)
})

it('useCerrarVisita calls cerrarVisita with the visitaId and coordFinal only, and returns the result', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 42, rubrosPendientes: 0 })
    const { result } = renderHook(() => useCerrarVisita(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({
            visitaId: 42,
            coordFinal: '-34.6,-58.6',
        })
    })
    expect(api.cerrarVisita).toHaveBeenCalledWith(42, {
        coordFinal: '-34.6,-58.6',
    })
    expect(out.rubrosPendientes).toBe(0)
})

it('useNoVisita calls registrarNoVisita with rotacionClienteId and motivoIds', async () => {
    ;(api.registrarNoVisita as any).mockResolvedValue({ rotacionClienteId: 42 })
    const { result } = renderHook(() => useNoVisita(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({
            rotacionClienteId: 42,
            motivoIds: [1, 4],
        })
    })
    expect(api.registrarNoVisita).toHaveBeenCalledWith({
        rotacionClienteId: 42,
        motivoIds: [1, 4],
    })
    expect(out.rotacionClienteId).toBe(42)
})
