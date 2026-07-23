export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export interface IMotivo {
    motivoId: number
    descripcion: string
}

export interface IAgendaClient {
    codigoParticularCliente: string
    nombreCliente: string
    barrio?: string
    diaVisita: string // e.g. "s1d1" — semana 1, día 1 (lunes)
    resuelto?: boolean // undefined in weekly view (only /agenda/dia populates it)
    descripcionSemana?: string // temporary mock-era zone/rotation label
}

export type SemanaAgenda = Record<Dia, IAgendaClient[]>

export interface IVisita {
    visitaId: number
    codigoParticularVendedor: string
    codigoParticularCliente: string
    nombreCliente: string
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
    seguimientoPendiente: boolean
    seguimientoMotivoPendiente: string | null
    seguimientoDescripcionPendiente: string | null
}

export interface IIniciarVisitaDTO {
    codigoParticularCliente: string
    nombreCliente: string
    coordInicio: string | null
}

export interface ISeguimientoResult {
    seguimientoPendiente: boolean
    motivoPendiente?: string // CRM_NOT_LINKED | CRM_TOKEN_EXPIRED | CRM_CLIENT_NOT_FOUND | CRM_UNAVAILABLE | CRM_UNKNOWN
    descripcionParaReintentar?: string
}

export interface ICerrarVisitaResult extends ISeguimientoResult {}

export interface INoVisitaResult extends ISeguimientoResult {
    visitaId: number
}

export interface IReintentarSeguimientoDTO {
    motivoIds?: number[] // optional override; if omitted, backend retries with the persisted descripcion
}
