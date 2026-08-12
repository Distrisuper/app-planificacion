import { apiClient } from './apiClient'
import type {
    Dia,
    IAgendaClient,
    IAgregarRubroDTO,
    IAgregarRubroResult,
    ICatalogoItem,
    ICerrarVisitaDTO,
    ICerrarVisitaResult,
    ICicloActualResult,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaDTO,
    INoVisitaResult,
    IPreviewCiclo,
    IReacomodarDTO,
    IResolucion,
    IResolverRubroDTO,
    IResolverRubroResult,
    IRubroClientsPageResponse,
    IRubroDropsResponse,
    IRubroEstado,
    ISincronizarResult,
    IVisitaRubro,
    NivelMotivo,
    SemanaAgenda,
} from '@/types/planificacion'

// ── Ciclo ──────────────────────────────────────────────────────────────────────

/** La rotación/ciclo del vendedor. `semanas`/`semanasPendientes` viajan siempre que haya una
 *  rotación abierta, tenga o no ciclo/semana abierto encima ahora mismo. */
export const getCicloActual = async (): Promise<ICicloActualResult> => {
    const res = await apiClient.get('/planificacion/ciclo/actual')
    return res.data.data
}

/** El plan de UNA semana de la rotación, de solo lectura — no abre nada. */
export const previewSemana = async (semana: number): Promise<IPreviewCiclo> => {
    const res = await apiClient.get(`/planificacion/rotacion/semana/${semana}`)
    return res.data.data
}

/** Idempotente: cierra la semana vencida si la hay y sincroniza altas/bajas del padrón.
 *  Nunca abre nada — el standby se resuelve solo con la primera acción real. */
export const sincronizar = async (): Promise<ISincronizarResult> => {
    const res = await apiClient.post('/planificacion/ciclo/sincronizar')
    return res.data.data
}

/** Mueve la fila del plan a otro día (y opcionalmente otra semana de la rotación). NO la
 *  resuelve: el cliente queda pendiente en su nueva posición.
 *
 *  NO abre nada, y por lo tanto NUNCA tira 409 CAMBIO_DE_SEMANA: en api-vendedores solo
 *  iniciarVisita y noVisita pasan por `CicloService.asegurar`, que es quien lo lanza —
 *  `VisitasService.reacomodar` ni lo llama. Sus errores propios son 403 FILA_AJENA,
 *  404 FILA_NOT_FOUND, 422 SEMANA_FUERA_DEL_SET y 400 DIA_INVALIDO. */
export const reacomodar = async (
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<void> => {
    await apiClient.patch(`/planificacion/rotacion-cliente/${rotacionClienteId}/reacomodar`, dto)
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

/** Marcas con ventas en los últimos 12 meses. Ordenadas por descripción del lado
 *  del server. */
export const getBrandCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/brand/catalog')
    return res.data.data
}
