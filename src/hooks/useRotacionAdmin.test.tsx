import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import type {
    Dia,
    IAgendaClientAdmin,
    IRotacionCompleta,
} from '@/types/planificacion'
import {
    useAgregarClienteExtraAdmin,
    useBuscarEnCarteraAdmin,
    useCancelarRotacion,
    useConsultarClienteAdmin,
    useCrearRotacion,
    useIntercambiarDias,
    useQuitarClienteAdmin,
    useReacomodarAdmin,
    useRestaurarClienteAdmin,
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

describe('useReacomodarAdmin — update optimista', () => {
    // Anotada: sin el tipo, las celdas que no se sobrescriben quedan `never[]` y leerles
    // un campo no compila.
    const vacia = (): Record<Dia, IAgendaClientAdmin[]> => ({
        LUN: [],
        MAR: [],
        MIE: [],
        JUE: [],
        VIE: [],
    })

    const gridInicial: IRotacionCompleta = {
        id: 7,
        codigoParticularVendedor: 'V 2',
        estado: 'abierta' as const,
        fechaInicio: null,
        fechaFin: null,
        descripcion: null,
        orden: null,
        semanas: [
            {
                semana: 1,
                descripcion: null,
                dias: {
                    ...vacia(),
                    LUN: [
                        {
                            rotacionClienteId: 11,
                            codigoParticularCliente: 'C001',
                            nombreCliente: 'Kiosco Uno',
                            dia: 1,
                            estado: 'pendiente' as const,
                            ultimoMovimiento: null,
                            eliminado: false,
                            esExtra: false,
                        },
                    ],
                },
            },
        ],
    }

    /** Wrapper con un QueryClient propio, para poder inspeccionar su caché. */
    function conCache() {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        qc.setQueryData(['rotacionAdmin', 'V 2', 'grid', 7], gridInicial)
        const wrap = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )
        return { qc, wrapper: wrap }
    }

    const celdas = (qc: QueryClient) => {
        const g = qc.getQueryData(['rotacionAdmin', 'V 2', 'grid', 7]) as typeof gridInicial
        return {
            LUN: g.semanas[0].dias.LUN.map(c => c.rotacionClienteId),
            JUE: g.semanas[0].dias.JUE.map(c => c.rotacionClienteId),
        }
    }

    it('mueve la card en la caché antes de que el backend conteste', async () => {
        const { qc, wrapper: w } = conCache()
        // Promesa que no resuelve: simula el PATCH todavía en vuelo.
        vi.mocked(api.reacomodarAdmin).mockReturnValue(new Promise(() => {}) as never)

        const { result } = renderHook(() => useReacomodarAdmin('V 2'), { wrapper: w })
        result.current.mutate({ rotacionId: 7, rotacionClienteId: 11, dia: 4 })

        // Sin esperar la respuesta, la card ya cambió de celda.
        await waitFor(() => expect(celdas(qc).JUE).toEqual([11]))
        expect(celdas(qc).LUN).toEqual([])
    })

    it('revierte si el backend rechaza el movimiento', async () => {
        const { qc, wrapper: w } = conCache()
        // El caso real: mover un cliente ya resuelto → 409 FILA_RESUELTA.
        vi.mocked(api.reacomodarAdmin).mockRejectedValue(new Error('409'))

        const { result } = renderHook(() => useReacomodarAdmin('V 2'), { wrapper: w })
        await result.current.mutateAsync({
            rotacionId: 7,
            rotacionClienteId: 11,
            dia: 4,
        }).catch(() => {})

        // Vuelve a su celda original: dejarla movida mostraría un estado que no existe.
        await waitFor(() => expect(celdas(qc).LUN).toEqual([11]))
        expect(celdas(qc).JUE).toEqual([])
    })
})

describe('useQuitarClienteAdmin', () => {
    it('quita por rotación y fila, e invalida el grid', async () => {
        vi.mocked(api.quitarClienteAdmin).mockResolvedValue(undefined)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
        const w = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => useQuitarClienteAdmin('V 2'), { wrapper: w })
        await result.current.mutateAsync({ rotacionId: 7, rotacionClienteId: 11 })

        expect(api.quitarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 11)
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ['rotacionAdmin', 'V 2', 'grid', 7],
        })
    })
})

describe('useRestaurarClienteAdmin', () => {
    it('restaura por rotación y fila, e invalida el grid', async () => {
        vi.mocked(api.restaurarClienteAdmin).mockResolvedValue(undefined)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
        const w = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => useRestaurarClienteAdmin('V 2'), { wrapper: w })
        await result.current.mutateAsync({ rotacionId: 7, rotacionClienteId: 11 })

        expect(api.restaurarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 11)
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ['rotacionAdmin', 'V 2', 'grid', 7],
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

describe('useIntercambiarDias', () => {
    it('manda vendedor, rotación y las dos celdas', async () => {
        vi.mocked(api.intercambiarDias).mockResolvedValue(18)

        const { result } = renderHook(() => useIntercambiarDias('V 2'), { wrapper })
        await result.current.mutateAsync({
            rotacionId: 7,
            semanaA: 1,
            diaA: 2,
            semanaB: 3,
            diaB: 5,
        })

        expect(api.intercambiarDias).toHaveBeenCalledWith('V 2', 7, {
            semanaA: 1,
            diaA: 2,
            semanaB: 3,
            diaB: 5,
        })
    })
})

describe('useBuscarEnCarteraAdmin', () => {
    it('no consulta con menos de 2 caracteres', () => {
        renderHook(() => useBuscarEnCarteraAdmin('V 2', 7, 'a'), { wrapper })
        expect(api.buscarEnCarteraAdmin).not.toHaveBeenCalled()
    })

    it('busca con el vendedor y la rotación del grid', async () => {
        vi.mocked(api.buscarEnCarteraAdmin).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'Almacén Zárate',
                estado: 'sin_plan',
                semana: null,
                dia: null,
                descripcionZona: null,
                fecha: null,
                motivo: null,
            },
        ])

        const { result } = renderHook(() => useBuscarEnCarteraAdmin('V 2', 7, 'alma'), {
            wrapper,
        })

        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.buscarEnCarteraAdmin).toHaveBeenCalledWith('V 2', 7, 'alma')
    })
})

describe('useAgregarClienteExtraAdmin', () => {
    it('crea la fila y releé el grid de esa rotación', async () => {
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
            codigoParticularCliente: 'P001',
            nombreCliente: 'Almacén Zárate',
            dia: 3,
            estado: 'pendiente',
            ultimoMovimiento: null,
            esExtra: true,
            eliminado: false,
        } as IAgendaClientAdmin)

        const { result } = renderHook(() => useAgregarClienteExtraAdmin('V 2'), { wrapper })
        result.current.mutate({ rotacionId: 7, codigoCliente: 'P001', semana: 2, dia: 3 })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3)
    })
})

describe('useConsultarClienteAdmin', () => {
    it('consulta un cliente puntual sin invalidar nada', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false }],
        })

        const { result } = renderHook(() => useConsultarClienteAdmin('V 2'), { wrapper })
        const consulta = await result.current.mutateAsync({
            rotacionId: 7,
            codigoCliente: 'P001',
        })

        expect(api.consultarClienteAdmin).toHaveBeenCalledWith('V 2', 7, 'P001')
        expect(consulta.yaPlanificado).toBe(true)
    })
})
