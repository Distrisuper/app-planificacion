import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useResumenMetricas, useObjecionDetalle, useClientesDeTramo, metricasKeys } from './useMetricas'
import * as api from '@/api/metricas'

vi.mock('@/api/metricas')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const F = { desde: '2026-09-01', hasta: '2026-09-30', sucursal: 'MDP' }
const ARGS = { pagina: 1, orden: 'nombre', dir: 'asc' as const }

beforeEach(() => vi.clearAllMocks())

it('useResumenMetricas pide con el filtro', async () => {
    ;(api.getResumenMetricas as any).mockResolvedValue({})
    const { result } = renderHook(() => useResumenMetricas(F), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getResumenMetricas).toHaveBeenCalledWith(F)
})

it('el detalle de objeción y los clientes de tramo no piden sin selección', async () => {
    const d = renderHook(() => useObjecionDetalle(F, null, ARGS), { wrapper })
    const t = renderHook(() => useClientesDeTramo(F, null, ARGS), { wrapper })
    await waitFor(() => expect(d.result.current.fetchStatus).toBe('idle'))
    await waitFor(() => expect(t.result.current.fetchStatus).toBe('idle'))
    expect(api.getObjecionDetalle).not.toHaveBeenCalled()
    expect(api.getClientesDeTramo).not.toHaveBeenCalled()
})

it('las claves incluyen todos los filtros geo', () => {
    const a = metricasKeys.resumen({ ...F, zona: '01' })
    const b = metricasKeys.resumen({ ...F, zona: '02' })
    expect(a).not.toEqual(b)
})

it('otra página de la MISMA objeción muestra la anterior mientras carga; otra objeción no', async () => {
    let resolver: (v: unknown) => void = () => {}
    ;(api.getObjecionDetalle as any)
        .mockResolvedValueOnce({ motivoId: 1, pagina: 1 })
        .mockImplementation(() => new Promise(r => { resolver = r }))
    const { result, rerender } = renderHook(
        ({ motivo, pagina }) => useObjecionDetalle(F, motivo, { ...ARGS, pagina }),
        { wrapper, initialProps: { motivo: 1 as number | null, pagina: 1 } },
    )
    await waitFor(() => expect(result.current.data).toEqual({ motivoId: 1, pagina: 1 }))

    rerender({ motivo: 1, pagina: 2 })
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data).toEqual({ motivoId: 1, pagina: 1 })

    rerender({ motivo: 2, pagina: 1 })
    expect(result.current.data).toBeUndefined()
    resolver({ motivoId: 2, pagina: 1 })
})
