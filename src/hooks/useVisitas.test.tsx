import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import {
    useIniciarVisita,
    useCerrarVisita,
    useNoVisita,
    useNoVisitaSobreVisitaAbierta,
    useReintentarSeguimiento,
    useVolverMasTarde,
} from './useVisitas'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
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
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 42, ofrecimientosPendientes: 0 })
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
    expect(out.ofrecimientosPendientes).toBe(0)
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

it('useNoVisitaSobreVisitaAbierta manda visitaId y motivoIds al endpoint de la visita abierta', async () => {
    ;(api.noVisitaSobreVisitaAbierta as any).mockResolvedValue({ rotacionClienteId: 42 })
    const { result } = renderHook(() => useNoVisitaSobreVisitaAbierta(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({ visitaId: 5, motivoIds: [1, 2] })
    })
    expect(api.noVisitaSobreVisitaAbierta).toHaveBeenCalledWith(5, [1, 2])
    expect(out.rotacionClienteId).toBe(42)
})

it('useReintentarSeguimiento calls reintentarSeguimiento with the resolucionId and returns the result', async () => {
    ;(api.reintentarSeguimiento as any).mockResolvedValue({ enviado: false, motivo: 'CRM_ERROR', mensaje: 'No pudimos conectar con el CRM. Probá de nuevo.' })
    const { result } = renderHook(() => useReintentarSeguimiento(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(5)
    })
    expect(api.reintentarSeguimiento).toHaveBeenCalledWith(5)
    expect(out).toEqual({
        enviado: false,
        motivo: 'CRM_ERROR',
        mensaje: 'No pudimos conectar con el CRM. Probá de nuevo.',
    })
})

describe('useVolverMasTarde', () => {
    const card = (rotacionClienteId: number, over: any = {}) => ({
        codigoCliente: 'C1', codigoParticularCliente: '10034', nombreCliente: 'ALMACEN',
        rotacionClienteId, dia: 1, estado: 'en_curso', visitaId: 7, ofrecimientosPendientes: 3,
        seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null }, esExtra: false,
        observaciones: null, ...over,
    })

    function setup() {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
        qc.setQueryData(agendaKeys.semana, {
            LUN: [card(42), card(43, { estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0 })],
            MAR: [], MIE: [], JUE: [], VIE: [],
        })
        // Sin ciclo abierto la agenda sale del preview: la card también tiene que pasar ahí.
        qc.setQueryData(cicloKeys.preview(1), {
            semana: 1, clientes: 1, omitidos: [],
            dias: { LUN: [card(42)], MAR: [], MIE: [], JUE: [], VIE: [] },
        })
        const w = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )
        return { qc, ...renderHook(() => useVolverMasTarde(), { wrapper: w }) }
    }

    it('manda la coordenada y deja la card pendiente y sin visita en la agenda y en el preview', async () => {
        ;(api.volverMasTarde as any).mockResolvedValue({ rotacionClienteId: 42, estado: 'pendiente' })
        const { qc, result } = setup()

        await act(() => result.current.mutateAsync({ visitaId: 7, coordCancelacion: '-34.6,-58.4' }))

        expect(api.volverMasTarde).toHaveBeenCalledWith(7, '-34.6,-58.4')
        const semana = qc.getQueryData<any>(agendaKeys.semana)
        expect(semana.LUN[0]).toMatchObject({ estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0 })
        expect(qc.getQueryData<any>(cicloKeys.preview(1)).dias.LUN[0]).toMatchObject({
            estado: 'pendiente',
            visitaId: null,
        })
    })
})
