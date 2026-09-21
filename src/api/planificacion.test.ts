import { vi, type Mock } from 'vitest'
import { apiClient } from './apiClient'
import {
    getCicloActual,
    previewSemana,
    sincronizar,
    reacomodar,
    getAgendaSemana,
    getAgendaDia,
    getMotivos,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
    reintentarSeguimiento,
    getOfrecimientos,
    agregarOfrecimiento,
    resolverOfrecimiento,
    eliminarOfrecimiento,
    getPropuesta,
    getRubroStatus,
    getBrandCatalog,
    getAcciones,
    crearAlta,
    editarAlta,
    reintentarAlta,
    eliminarFilaPropia,
    getMePlanificacion,
    reiniciarPrueba,
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

    it('normaliza campos a [] cuando el back no lo manda', async () => {
        ;(apiClient.get as Mock).mockResolvedValue({
            data: {
                data: [
                    {
                        motivoId: 13,
                        nivel: 'ofrecimiento',
                        descripcion: 'Precio',
                        resultado: 'perdido',
                        codigo: 'PRECIO',
                    },
                ],
            },
        })

        const motivos = await getMotivos('ofrecimiento')

        expect(motivos[0].campos).toEqual([])
    })

    it('deja pasar los campos declarados tal cual', async () => {
        const campos = [
            {
                campo: 'plazo_dias',
                tipo: 'numero',
                label: 'Plazo solicitado',
                placeholder: 'Ej. 30',
                unidad: 'días',
                requerido: true,
                orden: 10,
            },
        ]
        ;(apiClient.get as Mock).mockResolvedValue({
            data: {
                data: [
                    {
                        motivoId: 14,
                        nivel: 'ofrecimiento',
                        descripcion: 'Plazo',
                        resultado: 'perdido',
                        codigo: 'PLAZO',
                        campos,
                    },
                ],
            },
        })

        const motivos = await getMotivos('ofrecimiento')

        expect(motivos[0].campos).toEqual(campos)
    })
})

describe('visitas', () => {
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

    it('cerrarVisita manda observaciones cuando hay texto', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 42, ofrecimientosPendientes: 0 }))
        await cerrarVisita(42, { coordFinal: '-34.7,-58.4', observaciones: 'Pidió lista' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: '-34.7,-58.4',
            observaciones: 'Pidió lista',
        })
    })

    it('cerrarVisita manda detalle solo cuando viene', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ visitaId: 7, ofrecimientosPendientes: 0 }))
        await cerrarVisita(7, { coordFinal: 'c', detalle: { contacto: 'G', fechaNacimiento: null } })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/7/cerrar', {
            coordFinal: 'c',
            detalle: { contacto: 'G', fechaNacimiento: null },
        })
    })

    it('registrarNoVisita manda rotacionClienteId y motivoIds', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ rotacionClienteId: 11 }))
        await registrarNoVisita({ rotacionClienteId: 11, motivoIds: [1, 3] })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/no-visita', {
            rotacionClienteId: 11,
            motivoIds: [1, 3],
        })
    })

    it('reintentarSeguimiento postea sin body sobre la resolución', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ enviado: true, mensaje: null }))
        const res = await reintentarSeguimiento(5)
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas/5/seguimiento')
        expect(res).toEqual({ enviado: true, mensaje: null })
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

describe('getRubroStatus', () => {
    it('pega a client-context y mapea rubros con marcas, dividiendo last6Months por 6', async () => {
        ;(apiClient.post as Mock).mockResolvedValue({
            data: {
                ok: 1,
                data: {
                    particularCode: '07463',
                    clientName: 'X',
                    currentYM: '2026-09',
                    rubros: [
                        {
                            rubroCode: 'R1',
                            rubroDescription: 'DISCOS, CAMP',
                            totalsByPeriod: {
                                thisMonth: { amount: 0, units: 0 },
                                lastMonth: { amount: 54, units: 1 },
                                last6Months: { amount: 498, units: 9 },
                            },
                            brands: [
                                {
                                    brandCode: 'B1',
                                    brandName: 'FREMAX',
                                    totalsByPeriod: {
                                        thisMonth: { amount: 0, units: 0 },
                                        lastMonth: { amount: 54, units: 1 },
                                        last6Months: { amount: 366, units: 6 },
                                    },
                                    dropped: false,
                                },
                                {
                                    brandCode: 'B2',
                                    brandName: 'CORVEN',
                                    totalsByPeriod: {
                                        thisMonth: { amount: 0, units: 0 },
                                        lastMonth: { amount: 0, units: 0 },
                                        last6Months: { amount: 132, units: 3 },
                                    },
                                    dropped: true,
                                },
                            ],
                        },
                    ],
                },
            },
        })

        const out = await getRubroStatus('07463')

        expect(apiClient.post).toHaveBeenCalledWith('/sale/rubro/client-context', { particularCode: '07463' })
        expect(out).toEqual([
            {
                rubroCode: 'R1',
                nombre: 'DISCOS, CAMP',
                actual: 0,
                mesAnterior: 54,
                promedio6m: 83,
                actualUnidades: 0,
                mesAnteriorUnidades: 1,
                promedio6mUnidades: 1.5,
                marcas: [
                    {
                        code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61,
                        actualUnidades: 0, mesAnteriorUnidades: 1, promedio6mUnidades: 1, dejo: false,
                    },
                    {
                        code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22,
                        actualUnidades: 0, mesAnteriorUnidades: 0, promedio6mUnidades: 0.5, dejo: true,
                    },
                ],
            },
        ])
    })

    it('rubro sin marcas → marcas: []', async () => {
        ;(apiClient.post as Mock).mockResolvedValue({
            data: { ok: 1, data: { particularCode: '1', clientName: '', currentYM: '2026-09', rubros: [
                { rubroCode: 'R9', rubroDescription: 'X', totalsByPeriod: { thisMonth: { amount: 1, units: 0 }, lastMonth: { amount: 0, units: 0 }, last6Months: { amount: 0, units: 0 } }, brands: [] },
            ] } },
        })
        const out = await getRubroStatus('1')
        expect(out[0].marcas).toEqual([])
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

describe('altas', () => {
    it('crearAlta hace POST /planificacion/altas con el body plano', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ rotacionClienteId: 9 }))
        await crearAlta({ semana: 2, dia: 3, nombre: 'Piche' })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/altas', {
            semana: 2,
            dia: 3,
            nombre: 'Piche',
        })
    })

    it('editarAlta hace PUT /planificacion/altas/:id', async () => {
        ;(apiClient.put as any).mockResolvedValue(ok({ rotacionClienteId: 9 }))
        await editarAlta(9, { nombre: 'Piche SRL' })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/altas/9', {
            nombre: 'Piche SRL',
        })
    })

    it('reintentarAlta hace POST /planificacion/altas/:id/reintentar con { dia }', async () => {
        ;(apiClient.post as any).mockResolvedValue(ok({ rotacionClienteId: 12 }))
        await reintentarAlta(9, 4)
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/altas/9/reintentar', {
            dia: 4,
        })
    })

    it('eliminarFilaPropia pega al DELETE de la fila del vendedor', async () => {
        ;(apiClient.delete as Mock).mockResolvedValue({ data: { ok: 1 } })
        await eliminarFilaPropia(42)
        expect(apiClient.delete).toHaveBeenCalledWith('/planificacion/rotacion-cliente/42')
    })
})

describe('vendedor de prueba', () => {
    it('getMePlanificacion pega a GET /planificacion/me y devuelve data', async () => {
        const me = {
            rol: 'admin',
            capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
            vendedoresVisibles: null,
            vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2'] },
        }
        ;(apiClient.get as any).mockResolvedValue({ data: { ok: 1, data: me } })
        await expect(getMePlanificacion()).resolves.toEqual(me)
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/me')
    })

    it('reiniciarPrueba manda { origen } al POST y devuelve el vendedorDePrueba', async () => {
        const vp = { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2'] }
        ;(apiClient.post as any).mockResolvedValue({ data: { ok: 1, data: vp } })
        await expect(reiniciarPrueba('V 2')).resolves.toEqual(vp)
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/prueba/reiniciar', { origen: 'V 2' })
    })

    it('reiniciarPrueba con null manda { origen: null } (arrancar vacío)', async () => {
        ;(apiClient.post as any).mockResolvedValue({ data: { ok: 1, data: {} } })
        await reiniciarPrueba(null)
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/prueba/reiniciar', { origen: null })
    })
})
