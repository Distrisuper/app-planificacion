import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import * as api from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { useActualizarFicha } from './useFicha'
import type { SemanaAgenda } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const card = (codigo: string, over: any = {}) => ({
    codigoCliente: codigo, codigoParticularCliente: codigo, nombreCliente: codigo,
    rotacionClienteId: 1, dia: 1, estado: 'pendiente', visitaId: null, ofrecimientosPendientes: 0,
    seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null }, esExtra: false,
    observaciones: null, ficha: { pendientes: ['facturacion'], valores: {} }, ...over,
})

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const semana: SemanaAgenda = {
        LUN: [card('10034'), card('20001')],
        MAR: [card('10034', { rotacionClienteId: 2, dia: 2 })],
        MIE: [], JUE: [], VIE: [],
    } as any
    qc.setQueryData(agendaKeys.semana, semana)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    return { qc, ...renderHook(() => useActualizarFicha(), { wrapper }) }
}

it('llama al API y escribe la ficha nueva en TODAS las cards de ese cliente en la caché de la semana', async () => {
    const ficha = { pendientes: [], valores: { facturacion: ['3'] } }
    ;(api.actualizarFicha as any).mockResolvedValue(ficha)
    const { qc, result } = setup()

    await act(() => result.current.mutateAsync({ codigoParticularCliente: '10034', valores: { facturacion: ['3'] } }))

    expect(api.actualizarFicha).toHaveBeenCalledWith('10034', { facturacion: ['3'] })
    const semana = qc.getQueryData<any>(agendaKeys.semana)
    expect(semana.LUN[0].ficha).toEqual(ficha)
    expect(semana.MAR[0].ficha).toEqual(ficha)
    // El otro cliente no se toca.
    expect(semana.LUN[1].ficha).toEqual({ pendientes: ['facturacion'], valores: {} })
    await waitFor(() => expect(qc.getQueryState(agendaKeys.semana)?.isInvalidated).toBe(true))
})

it('si el API falla, la caché queda como estaba', async () => {
    ;(api.actualizarFicha as any).mockRejectedValue(new Error('500'))
    const { qc, result } = setup()
    await act(async () => {
        await result.current.mutateAsync({ codigoParticularCliente: '10034', valores: { facturacion: ['3'] } }).catch(() => {})
    })
    expect(qc.getQueryData<any>(agendaKeys.semana).LUN[0].ficha.pendientes).toEqual(['facturacion'])
})
