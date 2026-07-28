export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export type NivelMotivo = 'visita' | 'rubro'

/** Qué significa comercialmente el motivo. Solo los de nivel 'rubro' lo tienen. */
export type ResultadoMotivo = 'ganado' | 'diferido' | 'perdido' | 'no_ofrecido'

export type TipoResolucion = 'visita' | 'no_visita' | 'reagendada'

export type EstadoCiclo = 'abierta' | 'cerrada'

/** DERIVADO en el backend de la resolución del cliente — no existe como columna. */
export type EstadoCicloCliente =
    | 'pendiente'
    | 'en_curso'
    | 'visitada'
    | 'no_visita'
    | 'reagendada'

export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Si es true, resolver un rubro con este motivo exige marca/competidor/pctDiferencia. */
    requiereDetalle: boolean
}

export interface IBrandDiscount {
    code: string
    value: number
    description: string
}

/** Datos del cliente que vienen de fct_clients. Los comparten la agenda y el preview.
 *  Solo los tres primeros son `required` en el OpenAPI; el resto puede faltar. */
export interface IVisitClientCard {
    codigoCliente: string
    codigoParticularCliente: string
    nombreCliente: string
    nombreFantasia?: string
    barrio?: string
    localidad?: string
    direccion?: string
    telefono?: string
    latitud?: number | null
    longitud?: number | null
    codigoZona?: string
    comentario?: string
    isActive?: boolean
    bonusDiscount?: number | null
    generalDiscount?: number | null
    gmDiscount?: number | null
    brandDiscounts?: IBrandDiscount[]
    paymentCondition?: string | null
    paymentTermDays?: number | null
    paymentCreditLimit?: number | null
    paymentAmount?: number | null
    paymentPlan?: number | null

    /** Solo-front: el backend todavía no asigna horarios (ver lib/mockAgendaData.ts). */
    horaVisita?: string
}

/** Card de la VUELTA ABIERTA. Los cinco campos del ciclo son requeridos a propósito:
 *  con cicloClienteId opcional, iniciarVisita({ cicloClienteId: undefined }) compilaría. */
export interface IAgendaClient extends IVisitClientCard {
    cicloClienteId: number
    dia: number
    estado: EstadoCicloCliente
    /** Id de la resolución si es una visita (para retomar la carga de rubros). */
    visitaId: number | null
    /** Rubros de esa visita todavía sin motivos. 0 si no hay visita. */
    rubrosPendientes: number
}

/** Card de una semana NO abierta. Deliberadamente NO extiende IAgendaClient: sin ciclo
 *  no hay cicloClienteId ni estado, y que sea otro tipo es lo que impide que una card
 *  de preview llegue a una mutación. */
export interface IPreviewClient extends IVisitClientCard {
    dia: number
}

export interface IPreviewCiclo {
    /** La semana previsualizada. Si el request la omitió, es la que propuso el backend. */
    semana: number
    clientes: number
    omitidos: string[]
    dias: Record<Dia, IPreviewClient[]>
}

export interface ICicloSemana {
    id: number
    codigoParticularVendedor: string
    semana: number
    fechaApertura: string
    fechaCierre: string | null
    estado: EstadoCiclo
}

export interface IAbrirCicloResult {
    cicloId: number
    semana: number
    clientes: number
    omitidos: string[]
}

export interface IVisitaConRubrosPendientes {
    visitaId: number
    codigoParticularCliente: string
    rubros: number
}

export interface ICerrarCicloResult {
    cerrado: boolean
    clientesPendientes: string[]
    visitasConRubrosPendientes: IVisitaConRubrosPendientes[]
}

/** La visita activa: el backend devuelve la resolución cruda. */
export interface IResolucion {
    id: number
    cicloClienteId: number
    tipo: TipoResolucion
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
}

/** Un motivo aplicado a un rubro. marca/competidor/pctDiferencia solo se usan cuando el
 *  motivo tiene requiereDetalle; en el resto van null. */
export interface IRubroMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

/** Un rubro de la propuesta congelada. `resuelto` lo deriva el backend de motivos.length. */
export interface IVisitaRubro {
    id: number
    resolucionId: number
    rubroCode: string
    rubroDescripcion: string
    gapUnits: number | null
    esPropuesto: boolean
    resuelto: boolean
    motivos: IRubroMotivo[]
}

export type SemanaAgenda = Record<Dia, IAgendaClient[]>

export interface IRubroPropuesta {
    nombre: string
    // Mapped from IRubroRecommendation by usePropuesta — optional because the
    // real /sale/rubro/recommendations service has no "zone average" concept
    // (it compares against the client's own rubro minimum), so clientUnits/
    // zoneUnits stay undefined and the comparison UI hides itself gracefully
    // instead of inventing numbers.
    gapPct?: number
    clientUnits?: number
    zoneUnits?: number
}

// ── Raw shape of POST /sale/rubro/recommendations (RubroRecommendationService,
// api-vendedores) — mirrors RubroRecommendationsResponse there. Mapped to
// IRubroPropuesta by usePropuesta for the UI. ──
export interface IArticleToOffer {
    articleCode: string
    articleParticularCode: string
    articleDescription: string
    brandCode: string
    brandName: string
    kind: 'gap' | 'habitual'
    lookbackAvgUnits: number
    currentMonthUnits: number
}

export interface IRubroRecommendation {
    rubroCode: string
    rubroDescription: string
    rubroMinUnits: number
    gapUnits: number
    projection: {
        currentMonthUnits: number
        projectedUnits: number
        rubroRatio: number
        daysElapsed: number
        totalDays: number
    }
    lookback: {
        months: string[]
        activeMonths: number
        avgUnits: number
    }
    articlesToOffer: IArticleToOffer[]
    reason: string
}

export interface IClientRecommendation {
    clientCode: string
    particularCode: string
    clientName: string
    sellerCode: string
    sellerName: string
    rubros: IRubroRecommendation[]
}

export interface IRubroRecommendationsResponse {
    currentYM: string
    daysElapsed: number
    totalDays: number
    clients: IClientRecommendation[]
    total: number
}

export interface IIniciarVisitaDTO {
    cicloClienteId: number
    /** Obligatoria: el backend rechaza null con COORD_REQUERIDA. */
    coordInicio: string
}

/** Sin motivoIds: al cerrar una visita el resultado comercial vive en los rubros. */
export interface ICerrarVisitaDTO {
    coordFinal: string
}

export interface ICerrarVisitaResult {
    visitaId: number
    /** Si es > 0, la visita cerró pero falta cargar resoluciones. */
    rubrosPendientes: number
}

/** Único lugar donde se piden motivos a nivel visita. */
export interface INoVisitaDTO {
    cicloClienteId: number
    motivoIds: number[]
}

export interface INoVisitaResult {
    cicloClienteId: number
}

export interface IResolverRubroDTO {
    motivos: IRubroMotivo[]
}

export interface IResolverRubroResult {
    rubrosPendientes: number
}

export interface IAgregarRubroDTO {
    rubroCode: string
    rubroDescripcion: string
}

export interface IAgregarRubroResult {
    visitaRubroId: number
}
