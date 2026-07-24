import { vi } from 'vitest'
import { apiClient } from './apiClient'
import {
    getAgendaSemana,
    getAgendaDia,
    getMotivos,
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
    reintentarSeguimiento,
    getPropuesta,
} from './planificacion'

vi.mock('./apiClient', () => ({
    apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

describe('planificacion API', () => {
    beforeEach(() => vi.clearAllMocks())

    it('getMotivos unwraps data.data', async () => {
        ;(apiClient.get as any).mockResolvedValue({
            data: { ok: 1, data: [{ motivoId: 1, descripcion: 'Precio' }] },
        })
        const motivos = await getMotivos()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos')
        expect(motivos).toEqual([{ motivoId: 1, descripcion: 'Precio' }])
    })

    it('iniciarVisita posts the DTO and returns { visitaId }', async () => {
        ;(apiClient.post as any).mockResolvedValue({ data: { ok: 1, data: { visitaId: 42 } } })
        const res = await iniciarVisita({
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: '-34.6,-58.6',
        })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas', {
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: '-34.6,-58.6',
        })
        expect(res.visitaId).toBe(42)
    })

    it('cerrarVisita PUTs to the visita id with coordFinal + motivoIds', async () => {
        ;(apiClient.put as any).mockResolvedValue({
            data: { ok: 1, data: { seguimientoPendiente: false } },
        })
        const res = await cerrarVisita(42, { coordFinal: null, motivoIds: [1, 2] })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: null,
            motivoIds: [1, 2],
        })
        expect(res.seguimientoPendiente).toBe(false)
    })

    it('getAgendaSemana gets without params when semana is omitted', async () => {
        ;(apiClient.get as any).mockResolvedValue({
            data: { ok: 1, data: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] } },
        })
        const res = await getAgendaSemana()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/semana', {
            params: undefined,
        })
        expect(res.LUN).toEqual([])
    })

    it('getAgendaSemana passes semana as a query param when given', async () => {
        ;(apiClient.get as any).mockResolvedValue({
            data: { ok: 1, data: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] } },
        })
        await getAgendaSemana('s2')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/semana', {
            params: { semana: 's2' },
        })
    })

    it('getAgendaDia gets with dia + fecha params', async () => {
        ;(apiClient.get as any).mockResolvedValue({
            data: { ok: 1, data: [{ codigoParticularCliente: '1', nombreCliente: 'A', diaVisita: 's1d1' }] },
        })
        const res = await getAgendaDia('LUN', '2026-07-27')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/dia', {
            params: { dia: 'LUN', fecha: '2026-07-27' },
        })
        expect(res).toHaveLength(1)
    })

    it('getVisitaActiva unwraps data.data (null when no active visit)', async () => {
        ;(apiClient.get as any).mockResolvedValue({ data: { ok: 1, data: null } })
        const res = await getVisitaActiva()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/visitas/activa')
        expect(res).toBeNull()
    })

    it('registrarNoVisita posts the body and unwraps the result', async () => {
        ;(apiClient.post as any).mockResolvedValue({
            data: { ok: 1, data: { visitaId: 7, seguimientoPendiente: false } },
        })
        const res = await registrarNoVisita({
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            motivoIds: [3],
        })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/no-visita', {
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            motivoIds: [3],
        })
        expect(res.visitaId).toBe(7)
    })

    it('reintentarSeguimiento posts to the visita seguimiento endpoint with default body', async () => {
        ;(apiClient.post as any).mockResolvedValue({
            data: { ok: 1, data: { seguimientoPendiente: false } },
        })
        const res = await reintentarSeguimiento(42)
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/42/seguimiento', {})
        expect(res.seguimientoPendiente).toBe(false)
    })

    it('getPropuesta posts particularCode and unwraps data.data', async () => {
        const response = { currentYM: '2026-07', daysElapsed: 24, totalDays: 31, clients: [], total: 0 }
        ;(apiClient.post as any).mockResolvedValue({ data: { ok: 1, data: response } })
        const res = await getPropuesta('10034')
        expect(apiClient.post).toHaveBeenCalledWith('/sale/rubro/recommendations', {
            particularCode: '10034',
        })
        expect(res).toEqual(response)
    })
})
