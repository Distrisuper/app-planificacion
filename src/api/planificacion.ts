import { apiClient } from './apiClient'
import type {
    IAgendaClient,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaResult,
    ICerrarVisitaResult,
    IReintentarSeguimientoDTO,
    IRubroRecommendationsResponse,
    ISeguimientoResult,
    IVisita,
    SemanaAgenda,
} from '@/types/planificacion'

// `semana` is the rotation key (e.g. "s1") of the 5-week cycle. The backend does NOT resolve
// "current week": it defaults to 's1' when omitted and otherwise returns exactly the week asked
// for. Resolving which cycle week today falls in (mod-5 over a fixed anchor) is the FRONT's job
// and is still pending — until then callers omit it and get s1. Param accepted now so the
// week-picker can pass it without a later API change.
export const getAgendaSemana = async (semana?: string): Promise<SemanaAgenda> => {
    const res = await apiClient.get('/planificacion/agenda/semana', {
        params: semana ? { semana } : undefined,
    })
    return res.data.data
}

export const getAgendaDia = async (
    dia: string,
    fecha: string,
): Promise<IAgendaClient[]> => {
    const res = await apiClient.get('/planificacion/agenda/dia', {
        params: { dia, fecha },
    })
    return res.data.data
}

export const getMotivos = async (): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos')
    return res.data.data
}

export const getVisitaActiva = async (): Promise<IVisita | null> => {
    const res = await apiClient.get('/planificacion/visitas/activa')
    return res.data.data
}

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}

export const cerrarVisita = async (
    visitaId: number,
    body: { coordFinal: string | null; motivoIds: number[] },
): Promise<ICerrarVisitaResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/cerrar`, body)
    return res.data.data
}

export const registrarNoVisita = async (body: {
    codigoParticularCliente: string
    nombreCliente: string
    motivoIds: number[]
}): Promise<INoVisitaResult> => {
    const res = await apiClient.post('/planificacion/visitas/no-visita', body)
    return res.data.data
}

/** Retries a failed Cromo sync for a visita that has `seguimientoPendiente: true`. */
export const reintentarSeguimiento = async (
    visitaId: number,
    body: IReintentarSeguimientoDTO = {},
): Promise<ISeguimientoResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/seguimiento`, body)
    return res.data.data
}

/** Reused endpoint: commercial proposal (rubros below average). */
export const getPropuesta = async (
    codigoParticularCliente: string,
): Promise<IRubroRecommendationsResponse> => {
    const res = await apiClient.post('/sale/rubro/recommendations', {
        particularCode: codigoParticularCliente,
    })
    return res.data.data ?? res.data
}
