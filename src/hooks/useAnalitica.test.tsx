import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useResumen, useVisitas, useVisitaDetalle, useObjeciones } from './useAnalitica'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24' }

beforeEach(() => vi.clearAllMocks())

it('useResumen pide el resumen con el filtro recibido', async () => {
    ;(api.getResumen as any).mockResolvedValue({ vendedores: [], promedios: {} })
    const { result } = renderHook(() => useResumen(FILTRO), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getResumen).toHaveBeenCalledWith(FILTRO)
})

it('useVisitas sin vendedor consulta igual: es la vista de actividad', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    const { result } = renderHook(() => useVisitas(FILTRO), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getVisitas).toHaveBeenCalledWith(FILTRO)
})

it('useVisitaDetalle no consulta con id null', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({ visitaId: 1 })
    const { result } = renderHook(() => useVisitaDetalle(null), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getVisitaDetalle).not.toHaveBeenCalled()
})

it('useVisitaDetalle pide el detalle del id indicado', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({ visitaId: 1000 })
    const { result } = renderHook(() => useVisitaDetalle(1000), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getVisitaDetalle).toHaveBeenCalledWith(1000)
})

it('useVisitas refresca solo si se le pide un intervalo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })

    const { result } = renderHook(() => useVisitas(FILTRO, { refrescarCada: 1000 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getVisitas).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1100)
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalledTimes(2))
    vi.useRealTimers()
})

it('useVisitas sin intervalo no vuelve a pedir solo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })

    const { result } = renderHook(() => useVisitas(FILTRO), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await vi.advanceTimersByTimeAsync(5000)
    expect(api.getVisitas).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
})

it('useObjeciones pide el ranking con zona y rubro', async () => {
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    const args = { ...FILTRO, zona: 'NORTE', rubro: 'R01' }
    const { result } = renderHook(() => useObjeciones(args), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getObjeciones).toHaveBeenCalledWith(args)
})
