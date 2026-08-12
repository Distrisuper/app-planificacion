import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacion'
import {
    useCicloActual,
    usePreviewSemana,
    useSincronizar,
    useReacomodar,
} from './useCiclo'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useCicloActual', () => {
    it('expone ciclo y semanas', async () => {
        const semanas = [
            { semana: 1, descripcion: null },
            { semana: 2, descripcion: 'Zárate' },
            { semana: 3, descripcion: null },
        ]
        vi.mocked(api.getCicloActual).mockResolvedValue({
            ciclo: null,
            semanas,
            semanasPendientes: [2],
        })
        const { result } = renderHook(() => useCicloActual(), { wrapper })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(result.current.data).toEqual({
            ciclo: null,
            semanas,
            semanasPendientes: [2],
        })
    })
})

describe('usePreviewSemana', () => {
    it('no consulta hasta estar habilitado', () => {
        renderHook(() => usePreviewSemana(3, false), { wrapper })
        expect(api.previewSemana).not.toHaveBeenCalled()
    })

    it('pide la semana indicada cuando está habilitado', async () => {
        vi.mocked(api.previewSemana).mockResolvedValue({
            semana: 3,
            clientes: 0,
            omitidos: [],
            dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
        })
        renderHook(() => usePreviewSemana(3, true), { wrapper })
        await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(3))
    })
})

describe('useSincronizar', () => {
    it('llama a sincronizar', async () => {
        vi.mocked(api.sincronizar).mockResolvedValue({
            semanaCerrada: null,
            descripcionSemanaCerrada: null,
            sinVisitar: [],
            rubrosAutocompletados: 0,
            altas: [],
            bajas: [],
            rotacionCerrada: false,
        })
        const { result } = renderHook(() => useSincronizar(), { wrapper })
        await result.current.mutateAsync()
        expect(api.sincronizar).toHaveBeenCalled()
    })
})

describe('useReacomodar', () => {
    it('manda rotacionClienteId, semana y dia', async () => {
        vi.mocked(api.reacomodar).mockResolvedValue(undefined)
        const { result } = renderHook(() => useReacomodar(), { wrapper })
        await result.current.mutateAsync({ rotacionClienteId: 42, semana: 3, dia: 2 })
        expect(api.reacomodar).toHaveBeenCalledWith(42, { semana: 3, dia: 2 })
    })
})
