import { apiClient } from './apiClient'
import type {
    Dia,
    IAbrirCicloResult,
    IAgendaClient,
    IAgregarRubroDTO,
    IAgregarRubroResult,
    ICatalogoItem,
    ICerrarCicloResult,
    ICerrarVisitaDTO,
    ICerrarVisitaResult,
    ICicloSemana,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaDTO,
    INoVisitaResult,
    IPreviewCiclo,
    IResolucion,
    IResolverRubroDTO,
    IResolverRubroResult,
    IRubroClientsPageResponse,
    IRubroDropsResponse,
    IRubroEstado,
    IVisitaRubro,
    NivelMotivo,
    SemanaAgenda,
} from '@/types/planificacion'

// ── Ciclo ──────────────────────────────────────────────────────────────────────

/** La vuelta abierta del vendedor, o null. Devuelve 200 con data:null cuando no hay
 *  ninguna, así que el front sabe ANTES de pedir la agenda (que tiraría 409). */
export const getCicloActual = async (): Promise<ICicloSemana | null> => {
    const res = await apiClient.get('/planificacion/ciclo/actual')
    return res.data.data
}

/** El plan de una semana SIN abrirla. Sin `semana`, el backend previsualiza la que
 *  propone y devuelve cuál eligió. */
export const getCicloPreview = async (semana?: number): Promise<IPreviewCiclo> => {
    const res = await apiClient.get('/planificacion/ciclo/preview', {
        params: semana === undefined ? undefined : { semana },
    })
    return res.data.data
}

export const abrirCiclo = async (semana?: number): Promise<IAbrirCicloResult> => {
    const res = await apiClient.post(
        '/planificacion/ciclo/abrir',
        semana === undefined ? {} : { semana },
    )
    return res.data.data
}

/** Ojo: con 409 el backend devuelve ok:0 pero CON data (las dos listas de bloqueo).
 *  El llamador lo lee de err.response.data.data — ver CerrarSemanaSheet. */
export const cerrarCiclo = async (): Promise<ICerrarCicloResult> => {
    const res = await apiClient.post('/planificacion/ciclo/cerrar')
    return res.data.data
}

/** Mueve el día del cliente dentro de la vuelta. NO lo resuelve: queda pendiente. */
export const reagendarCicloCliente = async (cicloClienteId: number, dia: number): Promise<void> => {
    await apiClient.patch(`/planificacion/ciclo-cliente/${cicloClienteId}/reagendar`, {
        dia,
    })
}

// ── Agenda ─────────────────────────────────────────────────────────────────────

/** Sin parámetro `semana`: la vuelta es la que el vendedor tiene abierta. */
export const getAgendaSemana = async (): Promise<SemanaAgenda> => {
    const res = await apiClient.get('/planificacion/agenda/semana')
    return res.data.data
}

export const getAgendaDia = async (dia: Dia): Promise<IAgendaClient[]> => {
    const res = await apiClient.get('/planificacion/agenda/dia', {
        params: { dia },
    })
    return res.data.data
}

// ── Motivos ────────────────────────────────────────────────────────────────────

export const getMotivos = async (nivel?: NivelMotivo): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos', {
        params: nivel === undefined ? undefined : { nivel },
    })
    return res.data.data
}

// ── Visitas ────────────────────────────────────────────────────────────────────

export const getVisitaActiva = async (): Promise<IResolucion | null> => {
    const res = await apiClient.get('/planificacion/visitas/activa')
    return res.data.data
}

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; rubros: number }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}

/** Sin motivoIds: el resultado comercial vive en los rubros y se puede cargar después. */
export const cerrarVisita = async (
    visitaId: number,
    body: ICerrarVisitaDTO,
): Promise<ICerrarVisitaResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/cerrar`, body)
    return res.data.data
}

export const registrarNoVisita = async (dto: INoVisitaDTO): Promise<INoVisitaResult> => {
    const res = await apiClient.post('/planificacion/visitas/no-visita', dto)
    return res.data.data
}

// ── Rubros de la visita ────────────────────────────────────────────────────────

/** La propuesta CONGELADA al iniciar la visita (más los agregados a mano). */
export const getRubros = async (visitaId: number): Promise<IVisitaRubro[]> => {
    const res = await apiClient.get(`/planificacion/visitas/${visitaId}/rubros`)
    return res.data.data
}

export const agregarRubro = async (
    visitaId: number,
    dto: IAgregarRubroDTO,
): Promise<IAgregarRubroResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/rubros`, dto)
    return res.data.data
}

/** Reemplaza los motivos del rubro, no acumula. No exige la visita abierta. */
export const resolverRubro = async (
    visitaId: number,
    rubroId: number,
    dto: IResolverRubroDTO,
): Promise<IResolverRubroResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/rubros/${rubroId}`, dto)
    return res.data.data
}

/** Solo rubros agregados a mano: los de la propuesta fallan con RUBRO_DE_PROPUESTA. */
export const eliminarRubro = async (visitaId: number, rubroId: number): Promise<void> => {
    await apiClient.delete(`/planificacion/visitas/${visitaId}/rubros/${rubroId}`)
}

// ── Propuesta comercial (endpoint reusado, fuera del dominio de planificación) ──

export const getPropuesta = async (
    codigoParticularCliente: string,
): Promise<IRubroDropsResponse> => {
    const res = await apiClient.post('/sale/rubro/recommendations/drops', {
        particularCode: codigoParticularCliente,
    })
    return res.data.data ?? res.data
}

/** "Cómo viene comprando" (Ver versus): TODOS los rubros del cliente con Actual/M.Ant/
 *  Prom.6M, sin el recorte a caídas/relleno de la propuesta. `pageSize` > 1 y el filtro
 *  por `particularCode` exacto evitan quedarse con otro cliente si el `search` matchea
 *  más de uno por nombre. */
export const getRubroStatus = async (
    codigoParticularCliente: string,
): Promise<IRubroEstado[]> => {
    const res = await apiClient.post('/sale/rubro/clients', {
        sellerCode: null,
        filters: { search: codigoParticularCliente },
        page: 0,
        pageSize: 5,
    })
    const data: IRubroClientsPageResponse = res.data.data ?? res.data
    const entity = data.entities.find(
        e => e.particularCode === codigoParticularCliente,
    )
    const items = entity?.breakdown?.items ?? []

    return items
        .filter(i => i.kind === 'rubro')
        .map(i => ({
            rubroCode: i.code,
            nombre: i.name,
            actual: i.totalsByPeriod.thisMonth?.amount ?? 0,
            mesAnterior: i.totalsByPeriod.lastMonth?.amount ?? 0,
            promedio6m: (i.totalsByPeriod.last6Months?.amount ?? 0) / 6,
        }))
}

// ── Catálogos (endpoints reusados, fuera del dominio de planificación) ─────────

/** Rubros válidos para poblar selects. Es la MISMA lista contra la que el backend
 *  valida la propuesta (RubroCatalogService) — no confundir con /clients/getRubros,
 *  que es otra query sobre staging, sin cache y con filtros propios. */
export const getRubroCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/rubro/catalog')
    return res.data.data
}

/** Marcas con ventas en los últimos 12 meses. Ordenadas por descripción del lado
 *  del server. */
export const getBrandCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/brand/catalog')
    return res.data.data
}
