import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import {
    useCancelarRotacion,
    useCrearRotacion,
    useReacomodarAdmin,
    useRotacion,
    useRotaciones,
} from './useRotacionAdmin'

vi.mock('@/api/planificacionAdmin')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRotaciones', () => {
    it('no consulta sin vendedor elegido', () => {
        renderHook(() => useRotaciones(null), { wrapper })
        expect(api.getRotaciones).not.toHaveBeenCalled()
    })

    it('trae la cola del vendedor elegido', async () => {
        vi.mocked(api.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
        ])

        const { result } = renderHook(() => useRotaciones('V 2'), { wrapper })

        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.getRotaciones).toHaveBeenCalledWith('V 2')
        expect(result.current.data?.[0].descripcion).toBe('Ronda Agosto')
    })
})

describe('useRotacion', () => {
    it('no consulta sin rotación elegida', () => {
        renderHook(() => useRotacion('V 2', null), { wrapper })
        expect(api.getRotacion).not.toHaveBeenCalled()
    })

    it('pide el grid de la rotación elegida', async () => {
        vi.mocked(api.getRotacion).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: null,
            semanas: [],
        })

        renderHook(() => useRotacion('V 2', 7), { wrapper })

        await waitFor(() => expect(api.getRotacion).toHaveBeenCalledWith('V 2', 7))
    })
})

describe('useReacomodarAdmin', () => {
    it('manda vendedor, rotación, fila y destino', async () => {
        vi.mocked(api.reacomodarAdmin).mockResolvedValue(undefined)

        const { result } = renderHook(() => useReacomodarAdmin('V 2'), { wrapper })
        await result.current.mutateAsync({
            rotacionId: 7,
            rotacionClienteId: 11,
            semana: 3,
            dia: 4,
        })

        expect(api.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, 11, {
            semana: 3,
            dia: 4,
        })
    })
})

describe('useCrearRotacion', () => {
    it('devuelve el id de la rotación nueva', async () => {
        vi.mocked(api.crearRotacion).mockResolvedValue(30)

        const { result } = renderHook(() => useCrearRotacion('V 2'), { wrapper })

        await expect(result.current.mutateAsync()).resolves.toBe(30)
        expect(api.crearRotacion).toHaveBeenCalledWith('V 2')
    })
})

describe('useCancelarRotacion', () => {
    it('cancela por id', async () => {
        vi.mocked(api.cancelarRotacion).mockResolvedValue(undefined)

        const { result } = renderHook(() => useCancelarRotacion('V 2'), { wrapper })
        await result.current.mutateAsync(30)

        expect(api.cancelarRotacion).toHaveBeenCalledWith('V 2', 30)
    })
})
