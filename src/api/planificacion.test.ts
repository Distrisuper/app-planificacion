import { vi } from 'vitest'
import { apiClient } from './apiClient'
import {
    getCicloActual,
    getCicloPreview,
    abrirCiclo,
    cerrarCiclo,
    reagendarCicloCliente,
    getAgendaSemana,
    getAgendaDia,
    getMotivos,
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
    getRubros,
    agregarRubro,
    resolverRubro,
    eliminarRubro,
    getPropuesta,
} from './planificacion'

vi.mock('./apiClient', () => ({
    apiClient: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

const ok = (data: unknown) => ({ data: { ok: 1, data } })

beforeEach(() => vi.clearAllMocks())

describe('ciclo', () => {
    it('getCicloActual devuelve null cuando no hay vuelta abierta', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok(null))
        await expect(getCicloActual()).resolves.toBeNull()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/actual')
    })

    it('getCicloPreview sin semana no manda params', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ semana: 3 }))
        await getCicloPreview()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/preview', {
            params: undefined,
        })
    })

    it('getCicloPreview con semana la manda como param', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ semana: 4 }))
        await getCicloPreview(4)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/preview', {
            params: { semana: 4 },
        })
    })

    it('abrirCiclo sin semana manda un body vacío', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cicloId: 1 }))
        await abrirCiclo()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/abrir', {})
    })

    it('cerrarCiclo postea sin body', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cerrado: true }))
        await cerrarCiclo()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/cerrar')
    })

    it('reagendarCicloCliente usa PATCH sobre el cicloClienteId', async () => {
        ;(apiClient.patch as any).mockResolvedValue({ data: { ok: 1 } })
        await reagendarCicloCliente(42, 3)
        expect(apiClient.patch).toHaveBeenCalledWith('/planificacion/ciclo-cliente/42/reagendar', {
            dia: 3,
        })
    })
})

describe('agenda', () => {
    it('getAgendaSemana NO manda semana: la vuelta es la abierta', async () => {
        // Regresión del contrato viejo, que pedía ?semana=s1.
        ;(apiClient.get as any).mockResolvedValue(ok({ LUN: [] }))
        await getAgendaSemana()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/semana')
    })

    it('getAgendaDia manda solo dia, sin fecha', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getAgendaDia('MIE')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/agenda/dia', {
            params: { dia: 'MIE' },
        })
    })
})

describe('motivos', () => {
    it('getMotivos sin nivel no manda params', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getMotivos()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos', {
            params: undefined,
        })
    })

    it('getMotivos filtra por nivel', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([]))
        await getMotivos('rubro')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos', {
            params: { nivel: 'rubro' },
        })
    })
})

describe('visitas', () => {
    it('getVisitaActiva devuelve la resolución cruda o null', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ id: 5, cicloClienteId: 11 }))
        const res = await getVisitaActiva()
        expect(res?.id).toBe(5)
    })

    it('iniciarVisita manda cicloClienteId, NO codigoParticularCliente', async () => {
        // Regresión del contrato viejo, que mandaba código + nombre del cliente.
        ;(apiClient.post as any).mockResolvedValue(ok({ visitaId: 42, rubros: 3 }))
        const res = await iniciarVisita({ cicloClienteId: 11, coordInicio: '-34.6,-58.4' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas', {
            cicloClienteId: 11,
            coordInicio: '-34.6,-58.4',
        })
        expect(res).toEqual({ visitaId: 42, rubros: 3 })
    })

    it('cerrarVisita manda SOLO coordFinal, nunca motivoIds', async () => {
        // Regresión del contrato viejo: el resultado comercial ahora vive en los rubros.
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 42, rubrosPendientes: 2 }))
        const res = await cerrarVisita(42, { coordFinal: '-34.7,-58.4' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: '-34.7,-58.4',
        })
        expect(res.rubrosPendientes).toBe(2)
    })

    it('registrarNoVisita manda cicloClienteId y motivoIds', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ cicloClienteId: 11 }))
        await registrarNoVisita({ cicloClienteId: 11, motivoIds: [1, 3] })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/no-visita', {
            cicloClienteId: 11,
            motivoIds: [1, 3],
        })
    })
})

describe('rubros', () => {
    it('getRubros lee los de la visita', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ id: 1 }]))
        await getRubros(42)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/visitas/42/rubros')
    })

    it('agregarRubro postea code y descripción', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ visitaRubroId: 7 }))
        await agregarRubro(42, { rubroCode: 'FILTROS', rubroDescripcion: 'Filtros' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/42/rubros', {
            rubroCode: 'FILTROS',
            rubroDescripcion: 'Filtros',
        })
    })

    it('resolverRubro manda los motivos y devuelve los pendientes', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ rubrosPendientes: 1 }))
        const motivos = [
            { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
        ]
        const res = await resolverRubro(42, 7, { motivos })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/rubros/7', {
            motivos,
        })
        expect(res.rubrosPendientes).toBe(1)
    })

    it('eliminarRubro borra por id', async () => {
        ;(apiClient.delete as any).mockResolvedValue({ data: { ok: 1 } })
        await eliminarRubro(42, 7)
        expect(apiClient.delete).toHaveBeenCalledWith('/planificacion/visitas/42/rubros/7')
    })
})

describe('propuesta', () => {
    it('getPropuesta apunta a /sale/rubro/recommendations/drops', async () => {
        ;(apiClient.post as any).mockResolvedValue({ data: { data: { rubros: [] } } })
        await getPropuesta('10034')
        expect(apiClient.post).toHaveBeenCalledWith('/sale/rubro/recommendations/drops', {
            particularCode: '10034',
        })
    })
})
