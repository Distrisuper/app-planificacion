export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export interface IMotivo {
    motivoId: number
    descripcion: string
}

export interface IBrandDiscount {
    code: string
    value: number
    description: string
}

// Espeja el "visit card" que devuelve /planificacion/agenda/{semana,dia}
// (api-vendedores → analytics.fct_clients + campo `visit`). Los campos marcados
// "siempre presente" vienen 1:1 del backend en cada respuesta; se dejan opcionales
// porque esta app es un consumidor parcial/defensivo y no todos se muestran aún.
export interface IAgendaClient {
    codigoParticularCliente: string // clave de join (particular_code); la usa todo el flujo de visita
    nombreCliente: string // business_name
    // trade_name real (cartel del local) cuando difiere de nombreCliente —
    // el vendedor reconoce el local por esto, no por la razón social.
    nombreFantasia?: string
    barrio?: string // neighborhood
    // direccion/telefono ahora son REALES desde fct_clients (address/phone).
    // telefono llega tal cual como string — el dato es inconsistente entre
    // clientes (a veces trae más de un número), así que no se parsea.
    direccion?: string
    telefono?: string
    // Slot de visita semana+día, e.g. "s1d1". La semana actual la resuelve el
    // front (ciclo mód-5) y la pasa como `semana`; el backend no la calcula.
    visit: string
    resuelto?: boolean // undefined in weekly view (only /agenda/dia populates it)

    // ── Resto del card real (siempre presente desde el backend; aún sin UI dedicada) ──
    codigoCliente?: string // client_code
    localidad?: string // city
    codigoZona?: string // zone_code
    comentario?: string // comment (notas de visita: contacto, horario, etc.)
    latitud?: number | null
    longitud?: number | null
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

    // ── Solo-front (sin campo backend todavía) ──
    // horaVisita sigue sin backend real — mock hasta que la agenda asigne
    // horarios de visita (problema aparte del dato de cliente).
    horaVisita?: string
    enCurso?: boolean
}

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
