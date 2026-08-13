export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export type NivelMotivo = 'visita' | 'ofrecimiento'

/** Qué significa comercialmente el motivo. Solo los de nivel 'ofrecimiento' lo tienen. */
export type ResultadoMotivo = 'ganado' | 'diferido' | 'perdido' | 'no_ofrecido'

export type TipoResolucion = 'visita' | 'no_visita'

export type EstadoCiclo = 'abierta' | 'cerrada'

/** DERIVADO en el backend de la resolución del cliente — no existe como columna. */
export type EstadoCicloCliente = 'pendiente' | 'en_curso' | 'visitada' | 'no_visita'

/** Entrada de catálogo para poblar selects. Rubros, marcas y acciones comparten forma. */
export interface ICatalogoItem {
    code: string
    description: string
}

export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Si es true, resolver un ofrecimiento con este motivo exige marca/competidor/pctDiferencia. */
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
    /** Id de la resolución si es una visita (para retomar la carga de ofrecimientos). */
    visitaId: number | null
    /** Ofrecimientos de esa visita todavía sin motivos. 0 si no hay visita. */
    ofrecimientosPendientes: number
}

/** El plan de una semana que no es necesariamente la abierta, con el estado REAL de
 *  cada cliente (visitada/no_visita/pendiente/en_curso) — incluso si esa semana ya
 *  está cerrada. `IAgendaClient`, no un tipo aparte: se puede actuar sobre estas cards
 *  igual que sobre las de la agenda (mismo rotacionClienteId real). */
export interface IPreviewCiclo {
    /** La semana previsualizada. */
    semana: number
    clientes: number
    omitidos: string[]
    dias: Record<Dia, IAgendaClient[]>
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

/** Una zona de la rotación con su nombre (`pl_rotacion_semana.descripcion`, heredado de la
 *  vuelta anterior — "Buenos Aires", "Zárate"). El vendedor no ve la palabra "semana": el
 *  header y la navegación de zonas usan `descripcion` y caen al número solo si es null. */
export interface IZonaCiclo {
    semana: number
    descripcion: string | null
}

/** `semanas`/`semanasPendientes` viajan siempre que el vendedor tiene una ROTACIÓN abierta,
 *  con o sin ciclo/semana abierto encima — así el front nunca tiene que asumir un tamaño fijo
 *  de rotación (hay vendedores con 4 semanas, o con un set no contiguo). Ausentes solo si el
 *  vendedor no tiene ninguna rotación materializada todavía.
 *
 *  `semanasPendientes` se queda en `number[]`, a diferencia de `semanas`: es una lista de
 *  "las que faltan" que solo se usa para elegir la próxima a proponer (el primer elemento),
 *  nunca para mostrarle un nombre al vendedor — no necesita cargar `descripcion`. */
export interface ICicloActualResult {
    ciclo: ICicloSemana | null
    semanas?: IZonaCiclo[]
    semanasPendientes?: number[]
}

export interface ISincronizarResult {
    semanaCerrada: number | null
    /** Nombre de la zona cerrada, o null si esa zona nunca se nombró. El vendedor no ve
     *  "semana N" — ver "El vocabulario: zona, no semana" en el spec del 2026-08-12. */
    descripcionSemanaCerrada: string | null
    sinVisitar: string[]
    ofrecimientosAutocompletados: number
    altas: string[]
    bajas: string[]
    rotacionCerrada: boolean
}

/** `semana` ausente = mover de día dentro de la semana actual de la fila. */
export interface IReacomodarDTO {
    semana?: number
    dia: number
}

/** Permutar todos los clientes de una celda (semana, día) por los de otra. */
export interface IIntercambiarDiasDTO {
    semanaA: number
    diaA: number
    semanaB: number
    diaB: number
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

export type TipoOfrecimiento = 'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'

/** Los tipos que pueden ser DESTINO de una oferta. 'accion' no: una acción no se
 *  aplica sobre otra acción. */
export type TipoAlcance = Exclude<TipoOfrecimiento, 'accion'>

export interface IAlcance {
    tipo: TipoAlcance
    codigo: string
    descripcion: string
}

/** Un motivo aplicado a un ofrecimiento. marca/competidor/pctDiferencia solo se usan cuando el
 *  motivo tiene requiereDetalle; en el resto van null. */
export interface IOfrecimientoMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

/** Un ofrecimiento de la propuesta congelada. `resuelto` lo deriva el backend de motivos.length. */
export interface IOfrecimiento {
    id: number
    resolucionId: number
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    gapUnits: number | null
    esPropuesto: boolean
    resuelto: boolean
    motivos: IOfrecimientoMotivo[]
    /** Cero elementos = oferta global, no "falta cargar". */
    alcance: IAlcance[]
}

/** Catálogo de acciones comerciales. Agregar una es un INSERT en el back, no un deploy. */
export interface IAccion {
    codigo: string
    descripcion: string
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
}

/** Sin motivoIds: al cerrar una visita el resultado comercial vive en los ofrecimientos. */
export interface ICerrarVisitaDTO {
    coordFinal: string
}

export interface ICerrarVisitaResult {
    visitaId: number
    /** Si es > 0, la visita cerró pero falta cargar resoluciones. */
    ofrecimientosPendientes: number
}

/** Único lugar donde se piden motivos a nivel visita. */
export interface INoVisitaDTO {
    rotacionClienteId: number
    motivoIds: number[]
}

export interface INoVisitaResult {
    rotacionClienteId: number
}

export interface IResolverOfrecimientoDTO {
    motivos: IOfrecimientoMotivo[]
}

export interface IResolverOfrecimientoResult {
    ofrecimientosPendientes: number
}

export interface IAgregarOfrecimientoDTO {
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    alcance?: IAlcance[]
}

export interface IAgregarOfrecimientoResult {
    ofrecimientoId: number
}

// ── Gerencia: la rotación de OTRO vendedor ─────────────────────────────────────

export type EstadoRotacion = 'programada' | 'abierta' | 'cerrada' | 'cancelada'

/** Quién movió una fila del plan por última vez. `usuario` es un email (o el id como
 *  string): los usuarios viven en el servicio de auth externo, así que la bitácora del
 *  backend guarda texto, no una FK. */
export interface IReacomodacionInfo {
    origen: 'vendedor' | 'gerencia'
    usuario: string
    /** Instante ISO en UTC. Se muestra con fechaHoraNegocio(), nunca crudo. */
    fecha: string
}

/**
 * Una card del grid de gerencia: SOLO lo que esa vista dibuja, más la autoría.
 *
 * NO extiende `IAgendaClient` a propósito. La card del vendedor trae 28 campos porque los
 * necesita para operar la visita (dirección, teléfono, coords, descuentos, condiciones de
 * pago); el grid dibuja nombre, código y estado. Mandar el resto costaba 7833 bytes por
 * card contra 152 útiles: 1.46 MB por rotación de 200 clientes donde alcanzan ~30 KB.
 * El backend proyecta estos campos explícitamente (GerenciaRotacionService.getRotacion).
 */
export interface IAgendaClientAdmin {
    rotacionClienteId: number
    codigoParticularCliente: string
    nombreCliente: string
    dia: number
    estado: EstadoCicloCliente
    ultimoMovimiento: IReacomodacionInfo | null
}

export interface ISemanaRotacionAdmin {
    semana: number
    /** El nombre de la zona, ej. "Buenos Aires". null = sin nombre todavía. */
    descripcion: string | null
    dias: Record<Dia, IAgendaClientAdmin[]>
}

/** Una rotación de la cola del vendedor, sin su grid. */
export interface IRotacionResumen {
    id: number
    codigoParticularVendedor: string
    estado: EstadoRotacion
    /** null mientras está 'programada': todavía no se sabe cuándo arranca. */
    fechaInicio: string | null
    fechaFin: string | null
    descripcion: string | null
    /** Posición en la cola. null en cualquier estado que no sea 'programada'. */
    orden: number | null
}

/** El grid completo de una rotación, en un solo payload. */
export interface IRotacionCompleta extends IRotacionResumen {
    semanas: ISemanaRotacionAdmin[]
}
