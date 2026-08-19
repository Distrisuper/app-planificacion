import { vi } from 'vitest'
import { apiClient } from './apiClient'
import {
    getCicloActual,
    previewSemana,
    sincronizar,
    reacomodar,
    getAgendaSemana,
    getAgendaDia,
    getMotivos,
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
    getOfrecimientos,
    agregarOfrecimiento,
    resolverOfrecimiento,
    eliminarOfrecimiento,
    getPropuesta,
    getBrandCatalog,
    getAcciones,
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

const PREVIEW_MOCK = {
    semana: 3,
    clientes: 2,
    omitidos: [],
    dias: { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] },
}
const SINCRONIZAR_MOCK = {
    semanaCerrada: null,
    sinVisitar: [],
    ofrecimientosAutocompletados: 0,
    altas: [],
    bajas: [],
    rotacionCerrada: false,
}

beforeEach(() => vi.clearAllMocks())

describe('getCicloActual', () => {
    it('devuelve el ciclo y el set de zonas (semana + descripcion)', async () => {
        const semanas = [
            { semana: 1, descripcion: null },
            { semana: 2, descripcion: 'Zárate' },
            { semana: 3, descripcion: null },
            { semana: 4, descripcion: 'Buenos Aires' },
        ]
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { data: { ciclo: null, semanas, semanasPendientes: [2, 4] } },
        })
        const res = await getCicloActual()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/ciclo/actual')
        expect(res).toEqual({ ciclo: null, semanas, semanasPendientes: [2, 4] })
    })
})

describe('previewSemana', () => {
    it('pide la semana indicada de solo lectura', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({ data: { data: PREVIEW_MOCK } })
        const res = await previewSemana(3)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/rotacion/semana/3')
        expect(res).toEqual(PREVIEW_MOCK)
    })
})

describe('sincronizar', () => {
    it('postea sin body', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ data: { data: SINCRONIZAR_MOCK } })
        const res = await sincronizar()
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/ciclo/sincronizar')
        expect(res).toEqual(SINCRONIZAR_MOCK)
    })
})

describe('reacomodar', () => {
    it('usa PATCH sobre el rotacionClienteId con semana y dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } })
        await reacomodar(42, { semana: 3, dia: 2 })
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/rotacion-cliente/42/reacomodar',
            { semana: 3, dia: 2 },
        )
    })

    it('sin semana solo manda dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } })
        await reacomodar(42, { dia: 2 })
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/rotacion-cliente/42/reacomodar',
            { dia: 2 },
        )
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
        await getMotivos('ofrecimiento')
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos', {
            params: { nivel: 'ofrecimiento' },
        })
    })
})

describe('visitas', () => {
    it('getVisitaActiva devuelve la resolución cruda o null', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok({ id: 5, rotacionClienteId: 11 }))
        const res = await getVisitaActiva()
        expect(res?.id).toBe(5)
    })

    it('iniciarVisita manda rotacionClienteId, NO codigoParticularCliente', async () => {
        // Regresión del contrato viejo, que mandaba código + nombre del cliente.
        ;(apiClient.post as any).mockResolvedValue(ok({ visitaId: 42, ofrecimientos: 3 }))
        const res = await iniciarVisita({ rotacionClienteId: 11, coordInicio: '-34.6,-58.4' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas', {
            rotacionClienteId: 11,
            coordInicio: '-34.6,-58.4',
        })
        expect(res).toEqual({ visitaId: 42, ofrecimientos: 3 })
    })

    it('cerrarVisita manda SOLO coordFinal, nunca motivoIds', async () => {
        // Regresión del contrato viejo: el resultado comercial ahora vive en los ofrecimientos.
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 42, ofrecimientosPendientes: 2 }))
        const res = await cerrarVisita(42, { coordFinal: '-34.7,-58.4' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: '-34.7,-58.4',
        })
        expect(res.ofrecimientosPendientes).toBe(2)
    })

    it('registrarNoVisita manda rotacionClienteId y motivoIds', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ rotacionClienteId: 11 }))
        await registrarNoVisita({ rotacionClienteId: 11, motivoIds: [1, 3] })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/no-visita', {
            rotacionClienteId: 11,
            motivoIds: [1, 3],
        })
    })
})

describe('ofrecimientos de la visita', () => {
    it('getOfrecimientos lee los de la visita', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ id: 1 }]))
        await getOfrecimientos(42)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/visitas/42/ofrecimientos')
    })

    it('agregarOfrecimiento manda tipo, codigo, descripcion y alcance', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ ofrecimientoId: 7 }))
        await agregarOfrecimiento(42, {
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/42/ofrecimientos', {
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })
    })

    it('resolverOfrecimiento manda los motivos y devuelve los pendientes', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ ofrecimientosPendientes: 1 }))
        const motivos = [
            { motivoId: 13, valores: { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 132 } },
        ]
        const res = await resolverOfrecimiento(42, 7, { motivos })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/ofrecimientos/7', {
            motivos,
        })
        expect(res.ofrecimientosPendientes).toBe(1)
    })

    it('eliminarOfrecimiento borra por id', async () => {
        ;(apiClient.delete as any).mockResolvedValue({ data: { ok: 1 } })
        await eliminarOfrecimiento(42, 7)
        expect(apiClient.delete).toHaveBeenCalledWith('/planificacion/visitas/42/ofrecimientos/7')
    })

    it('getOfrecimientos devuelve el tipo y el alcance', async () => {
        ;(apiClient.get as any).mockResolvedValue(
            ok([
                {
                    id: 1,
                    resolucionId: 10,
                    tipo: 'accion',
                    codigo: 'CUPO',
                    descripcion: 'Plan cupo',
                    gapUnits: null,
                    esPropuesto: false,
                    resuelto: false,
                    motivos: [],
                    alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
                },
            ]),
        )

        const ofrecimientos = await getOfrecimientos(10)

        expect(ofrecimientos[0].tipo).toBe('accion')
        expect(ofrecimientos[0].alcance).toEqual([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
        ])
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

describe('catálogos', () => {
    it('getBrandCatalog apunta a /sale/brand/catalog', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ code: 'FR', description: 'Fric-Rot' }]))
        await expect(getBrandCatalog()).resolves.toEqual([{ code: 'FR', description: 'Fric-Rot' }])
        expect(apiClient.get).toHaveBeenCalledWith('/sale/brand/catalog')
    })

    it('getAcciones pega al catálogo', async () => {
        ;(apiClient.get as any).mockResolvedValue(
            ok([{ codigo: 'CUPO', descripcion: 'Plan cupo' }]),
        )
        await expect(getAcciones()).resolves.toEqual([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/acciones')
    })
})
