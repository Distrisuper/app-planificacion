export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export type NivelMotivo = 'visita' | 'rubro'

/** Qué significa comercialmente el motivo. Solo los de nivel 'rubro' lo tienen. */
export type ResultadoMotivo = 'ganado' | 'diferido' | 'perdido' | 'no_ofrecido'

export type TipoResolucion = 'visita' | 'no_visita'

export type EstadoCiclo = 'abierta' | 'cerrada'

/** DERIVADO en el backend de la resolución del cliente — no existe como columna. */
export type EstadoCicloCliente = 'pendiente' | 'en_curso' | 'visitada' | 'no_visita'

/** Entrada de catálogo para poblar selects. Rubros y marcas comparten forma. */
export interface ICatalogoItem {
    code: string
    description: string
}

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
}

/** Card de la vuelta abierta O de una semana previsualizada — ver decisión de diseño en el
 *  plan de este dominio: ambas fuentes ya traen un rotacionClienteId real. Los cinco campos
 *  son requeridos a propósito: con rotacionClienteId opcional, iniciarVisita({
 *  rotacionClienteId: undefined }) compilaría. */
export interface IAgendaClient extends IVisitClientCard {
    rotacionClienteId: number
    dia: number
    estado: EstadoCicloCliente
    /** Id de la resolución si es una visita (para retomar la carga de rubros). */
    visitaId: number | null
    /** Rubros de esa visita todavía sin motivos. 0 si no hay visita. */
    rubrosPendientes: number
}

/** Card de una semana que no es necesariamente la abierta. A diferencia del modelo viejo,
 *  SÍ trae un rotacionClienteId real (GET /rotacion/semana/:semana lee el plan ya
 *  materializado) — se puede actuar sobre ella igual que sobre una de la agenda. */
export interface IPreviewClient extends IVisitClientCard {
    rotacionClienteId: number
    dia: number
}

export interface IPreviewCiclo {
    /** La semana previsualizada. */
    semana: number
    clientes: number
    omitidos: string[]
    dias: Record<Dia, IPreviewClient[]>
}

export interface ICicloSemana {
    id: number
    rotacionId: number
    codigoParticularVendedor: string
    semana: number
    fechaLunes: string
    fechaApertura: string
    fechaCierre: string | null
    estado: EstadoCiclo
}

/** `semanas`/`semanasPendientes` viajan siempre que el vendedor tiene una ROTACIÓN abierta,
 *  con o sin ciclo/semana abierto encima — así el front nunca tiene que asumir un tamaño fijo
 *  de rotación (hay vendedores con 4 semanas, o con un set no contiguo). Ausentes solo si el
 *  vendedor no tiene ninguna rotación materializada todavía. */
export interface ICicloActualResult {
    ciclo: ICicloSemana | null
    semanas?: number[]
    semanasPendientes?: number[]
}

export interface ISincronizarResult {
    semanaCerrada: number | null
    sinVisitar: string[]
    rubrosAutocompletados: number
    altas: string[]
    bajas: string[]
    rotacionCerrada: boolean
}

/** `semana` ausente = mover de día dentro de la semana actual de la fila. */
export interface IReacomodarDTO {
    semana?: number
    dia: number
}

/** La visita activa: el backend devuelve la resolución cruda. */
export interface IResolucion {
    id: number
    rotacionClienteId: number
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
    rubroCode: string
    nombre: string
    pesosPerdidos: number
    /** -0.62 = cayó 62% vs. el promedio de 6 meses del propio cliente. */
    caidaPct: number | null
    /** true = relleno hasta el limit, no llegó al umbral de caída sostenida. */
    isFallback: boolean
    reason: string
    /** Se arrastran crudos desde la respuesta; hoy no los consume ninguna vista. */
    current?: IRubroMonthDrop
    prev?: IRubroMonthDrop
}

/** Lo que se manda de vuelta a `POST /planificacion/visitas`: la propuesta tal
 *  como se le mostró al vendedor. El back resuelve rubroDescripcion por su cuenta. */
export interface IPropuestaRubroDTO {
    rubroCode: string
    pesosPerdidos: number
    caidaPct: number
}

// ── Raw shape of POST /sale/rubro/recommendations/drops (RubroDropsService,
// api-vendedores). Mapped to IRubroPropuesta by usePropuesta for the UI. ──
export interface IRubroMonthDrop {
    yearMonth: string
    actual: number
    /** Proyección a fin de mes; null en meses ya cerrados. */
    projected: number | null
    /** Promedio de los 6 meses previos a ESTE mes. */
    baseline: number
    dropPct: number | null
    lost: number
    isRed: boolean
}

export interface IDroppedRubro {
    rubroCode: string
    rubroDescription: string
    isRedBoth: boolean
    isFallback: boolean
    pesosPerdidos: number
    /** Opcionales a propósito: se vio la respuesta real (200) traer rubros sin estos dos
     *  campos. Declararlos requeridos hacía que `r.current.dropPct` pareciera seguro y
     *  rompía el mapeo en runtime — ver el test de regresión en usePropuesta.test.tsx. */
    current?: IRubroMonthDrop
    prev?: IRubroMonthDrop
    reason: string
}

export interface IRubroDropsResponse {
    particularCode: string
    clientName: string
    sellerCode: string
    currentYM: string
    daysElapsed: number
    totalDays: number
    inflationAdjusted: boolean
    total: number
    rubros: IDroppedRubro[]
}

/** Fila de la tabla "Ver más" (cómo viene comprando el cliente, TODOS los
 *  rubros — a diferencia de la propuesta, que solo trae los caídos/relleno). */
export interface IRubroEstado {
    rubroCode: string
    nombre: string
    actual: number
    mesAnterior: number
    /** Promedio mensual de los últimos 6 meses cerrados. */
    promedio6m: number
}

// ── Raw shape of POST /sale/rubro/clients (RubroClientsService, api-vendedores)
// — solo los campos que se leen acá. Ver getRubroStatus. ──
export interface IRubroClientsPeriodMetrics {
    amount: number
}

export interface IRubroClientsBreakdownItem {
    kind: string
    code: string
    name: string
    totalsByPeriod: Record<string, IRubroClientsPeriodMetrics | undefined>
}

export interface IRubroClientsEntity {
    code: string
    particularCode?: string
    breakdown?: { items: IRubroClientsBreakdownItem[] }
}

export interface IRubroClientsPageResponse {
    entities: IRubroClientsEntity[]
}

export interface IIniciarVisitaDTO {
    rotacionClienteId: number
    /** Obligatoria: el backend rechaza null con COORD_REQUERIDA. */
    coordInicio: string
    /** La propuesta tal como se le mostró al vendedor. Si no viene, el backend la recalcula. */
    propuesta?: IPropuestaRubroDTO[]
    /** true = "sí, cerrá la otra semana y abrí esta" — se manda solo al reintentar después
     *  de un 409 CAMBIO_DE_SEMANA. */
    confirmarCambioDeSemana?: boolean
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
    rotacionClienteId: number
    motivoIds: number[]
    confirmarCambioDeSemana?: boolean
}

export interface INoVisitaResult {
    rotacionClienteId: number
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
