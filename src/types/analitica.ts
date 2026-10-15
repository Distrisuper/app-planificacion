import type {
    IAlcance, ResultadoMotivo, TipoOfrecimiento, TipoResolucion, EstadoCicloCliente, IDetalleAlta, IDetalleContactoAlta,
} from './planificacion'

export interface ICoord {
    lat: number
    lng: number
}

export interface IAnaliticaFiltro {
    /** YYYY-MM-DD */
    desde: string
    /** YYYY-MM-DD */
    hasta: string
    /** Vacío = todos los que el scope del usuario permita. */
    vendedores?: string[]
}

/** Métricas de un vendedor en el rango. La fila PROMEDIOS usa esta misma forma,
 *  así la tabla renderiza ambas con el mismo componente. */
export interface IVendedorMetricas {
    codigoParticularVendedor: string
    nombreVendedor: string

    // Cobertura — denominador = plan congelado de los ciclos que solapan el rango
    planificados: number
    visitados: number
    noVisita: number
    reagendados: number
    pendientes: number
    /** Visitas abiertas ahora mismo. Es un bucket propio: sin él los estados no suman
     *  planificados, y un cliente que el vendedor tiene adelante figuraría como pendiente. */
    enCurso: number
    /** 0..1. null si planificados === 0 (no se muestra 0%). */
    cobertura: number | null
    /** Cuántos de esos ciclos siguen abiertos. > 0 = la cobertura es parcial. */
    ciclosEnCurso: number

    // Actividad y calidad
    visitasTotales: number
    visitasValidas: number
    visitasNoValidadas: number
    /** Cliente sin coords en fct_clients: no se puede verificar, NO cuenta como inválida. */
    visitasSinCoord: number
    /** Duración menor a 15 min (sin techo, por ahora — ver CLAUDE.md): ya resta de
     *  visitasValidas (criterio de validez, no solo informativo). */
    visitasCortas: number
    /** Promedio solo sobre visitas válidas. null si no hay ninguna. */
    duracionPromedioMin: number | null
    minutosTotales: number
    /** Solo las visitas válidas (minutosTotales suma todas las cerradas). Opcional: un
     *  backend anterior a api-vendedores#137 no lo manda. */
    minutosValidos?: number
    visitasPorDia: number
    clientesDistintos: number

    // Objetivos (pl_objetivo). null = sin objetivo vigente → la UI muestra s/d.
    pctCumplimientoVisitas: number | null
    pctCumplimientoClientes: number | null
    pctCumplimientoMinutos: number | null
    /** Promedio de los tres cumplimientos de arriba, cada uno topeado a 100% antes de promediar. */
    efectividadOperativa: number | null

    // Efectividad comercial
    ofrecimientosTotales: number
    ofrecimientosGanados: number
    ofrecimientosDiferidos: number
    ofrecimientosPerdidos: number
    /** 0..1 = ganados/ofrecidos. null si ofrecimientosTotales === 0. */
    efectividadComercial: number | null
    /** 0..1 = propuestos que se cerraron sin ofrecer. null si no hubo propuestos. */
    pctNoOfrecidos: number | null
    /** Ofrecimientos sin resolver en visitas ya cerradas. Mide calidad del dato. */
    ofrecimientosSinResolver: number

    // Llamados de Televentas a los clientes del vendedor (el dueño del cliente al llamar).
    // Van aparte: no suman a visitas, horas, cobertura ni efectividad. Opcionales: un
    // backend anterior a /analitica/contactos no los manda, y la tarjeta no se inventa.
    llamados?: number
    llamadosAtendidos?: number
    /** Atendidos con algún rubro ganado (el estado "venta" de Televentas). */
    llamadosConVenta?: number
}

export interface IAnaliticaResumen {
    desde: string
    hasta: string
    diasHabiles: number
    /** nombreVendedor = 'PROMEDIOS', codigoParticularVendedor = ''. */
    promedios: IVendedorMetricas
    vendedores: IVendedorMetricas[]
}

/** Una fila de la tabla de visitas (nivel 2). */
export interface IVisitaFila {
    visitaId: number
    /** YYYY-MM-DD. El día de negocio (TZ Argentina) que resolvió el backend: es la
     *  clave de agrupación de la cobertura, no se recalcula acá. */
    fecha: string
    /** Instante ISO 8601 en UTC. La hora visible se formatea con `horaNegocio`. */
    fechaInicio: string
    /** null = visita en curso. */
    fechaFin: string | null
    duracionMin: number | null
    /** null = cliente sin coords → se muestra 's/d', nunca un número absurdo. Ambas
     *  tienen que estar dentro de la tolerancia para que la visita sea válida. */
    distanciaInicioMetros: number | null
    distanciaFinMetros: number | null
    codigoParticularCliente: string
    nombreCliente: string
    codigoParticularVendedor: string
    nombreVendedor: string
    tipo: TipoResolucion
    /** Descripciones de los motivos, ya resueltas contra el catálogo. */
    motivos: string[]
    /** Resultado dominante de los ofrecimientos de la visita. null si no hay ninguno resuelto. */
    resultado: ResultadoMotivo | null
    /** La misma clasificación que cuenta `visitasValidas`/`visitasNoValidadas` del resumen
     *  (la decide el backend con `pl_criterio_visita`). null en los "no visité". Opcional:
     *  un backend anterior al filtro por validez no la manda. */
    validez?: ValidezVisita | null
}

/** 'sin_coord' = cliente sin coordenadas: no verificable, no cuenta como inválida. */
export type ValidezVisita = 'valida' | 'no_validada' | 'sin_coord'

/** La fila de `pl_criterio_visita` (GET /analitica/criterio): con esto el backend
 *  clasifica cada visita. El front lo usa para pintar distancias y explicar la validez;
 *  nunca para recalcularla. */
export interface ICriterioVisita {
    toleranciaMetros: number
    duracionMinMin: number
    /** Un número enorme = sin techo (la columna es NOT NULL): ver `tieneTecho`. */
    duracionMaxMin: number
}

export interface IVisitasPage {
    total: number
    pagina: number
    cant: number
    visitas: IVisitaFila[]
}

export interface IVisitasArgs extends IAnaliticaFiltro {
    /** Ausente = todo el equipo del scope. Es lo que habilita la vista de actividad. */
    vendedor?: string
    cliente?: string
    /** Ausente = las tres resoluciones. */
    tipo?: TipoResolucion[]
    /** Implica sólo visitas: un "no visité" no se valida. */
    validez?: ValidezVisita
    pagina?: number
    cant?: number
}

/** Por dónde se contactó al cliente. Hoy visita o llamado; el chat sería un canal más. */
export type CanalContacto = 'visita' | 'llamado'

/** Una fila de visita del feed de contactos: la misma de /visitas, con su canal. Incluye
 *  los "No visité", que NO son un contacto (nadie habló con el cliente): no se cuentan
 *  como tal. */
export interface IContactoVisita extends IVisitaFila {
    canal: 'visita'
}

/** Lo que dejó un llamado, con la regla de Televentas. */
export type EstadoLlamado = 'venta' | 'pendiente_pedido' | 'sin_venta' | 'no_atendio' | 'volver_a_llamar'

/** Un llamado de Televentas. Sin duración, distancias ni validez: no hay GPS. */
export interface IContactoLlamado {
    canal: 'llamado'
    llamadoId: number
    tipo: 'atendido' | 'no_atendido'
    estado: EstadoLlamado
    /** Día de negocio del llamado (YYYY-MM-DD). */
    fecha: string
    /** Instante ISO UTC; la hora visible se formatea con `horaNegocio`. */
    fechaInicio: string
    /** El vendedor dueño del cliente al llamar. */
    codigoParticularVendedor: string
    nombreVendedor: string
    codigoParticularCliente: string
    nombreCliente: string
    /** Quién llamó (el TV). */
    codigoAutor: string
    nombreAutor: string | null
    motivos: string[]
    resultado: ResultadoMotivo | null
}

export type IContactoFila = IContactoVisita | IContactoLlamado

export interface IContactosPage {
    total: number
    pagina: number
    cant: number
    contactos: IContactoFila[]
}

export interface IContactosArgs extends IAnaliticaFiltro {
    vendedor?: string
    cliente?: string
    /** Ausente = todos los canales. */
    canal?: CanalContacto[]
    /** Implica canal visita: un llamado no se valida. */
    validez?: ValidezVisita
    pagina?: number
    cant?: number
}

/** GET /analitica/llamados/:id. */
export interface ILlamadoDetalle {
    llamadoId: number
    fecha: string
    fechaInicio: string
    tipo: 'atendido' | 'no_atendido'
    estado: EstadoLlamado
    codigoParticularVendedor: string
    nombreVendedor: string
    codigoParticularCliente: string
    nombreCliente: string
    codigoAutor: string
    nombreAutor: string | null
    /** Los motivos del llamado ("No atiende", "Volver a llamar"). */
    motivos: string[]
    ofrecimientos: {
        codigo: string
        descripcion: string
        motivos: { descripcion: string; resultado: string | null; valores: Record<string, string | number> }[]
        marcas: string[]
    }[]
    observaciones: string | null
    proximoContacto: string | null
}

export interface IOfrecimientoMotivoDetalle {
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Los valores tal como se guardaron. NO se filtran contra el módulo vigente: un campo
     *  que se sacó después igual tiene que verse en una visita ya cerrada. */
    valores: Record<string, string | number | null>
}

export interface IOfrecimientoDetalle {
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    esPropuesto: boolean
    resuelto: boolean
    motivos: IOfrecimientoMotivoDetalle[]
    alcance: IAlcance[]
}

/** Nivel 3: el detalle completo de una visita. */
export interface IVisitaDetalle {
    visitaId: number
    codigoParticularCliente: string
    nombreCliente: string
    direccion: string | null
    fechaInicio: string
    fechaFin: string | null
    duracionMin: number | null
    coordInicio: ICoord | null
    coordFinal: ICoord | null
    coordCliente: ICoord | null
    distanciaInicioMetros: number | null
    distanciaFinMetros: number | null
    ofrecimientos: IOfrecimientoDetalle[]
}

export interface IObjecionFila {
    motivoId: number
    descripcion: string
    resultado: ResultadoMotivo | null
    cantidad: number
    /** 0..1 sobre el total de motivos del rango. */
    pct: number
}

export interface IObjecionesResumen {
    total: number
    motivos: IObjecionFila[]
}

/** Una opción del filtro de vendedores. Es el roster completo del scope del usuario,
 *  no la lista de los que registraron actividad en el rango. */
export interface IVendedorOpcion {
    codigoParticularVendedor: string
    nombreVendedor: string
}

/** GET /planificacion/analitica/altas. Una por fila del plan tipo='alta' (un reintento
 *  aparece aparte, a propósito). Espejo del backend. */
export interface IAltaRelevada {
    rotacionClienteId: number
    vendedor: { codigo: string; nombre: string }
    estado: EstadoCicloCliente
    fechaVisita: string | null
    detalle: IDetalleAlta | null
    contacto: IDetalleContactoAlta | null
    camposCargados: number
    camposTotal: number
    /** El cliente real de Flexxus con el que administración la vinculó. Opcional: un backend
     *  previo al vínculo no lo manda. */
    vinculo?: IAltaVinculo | null
}

/** Espejo de pl_alta_vinculo (spec api-vendedores 2026-09-23-vincular-alta). */
export interface IAltaVinculo {
    codigoParticularCliente: string
    vinculadoPor: string
    /** ISO UTC. */
    vinculadoEn: string
}

export interface IVincularAltaResult extends IAltaVinculo {
    fichaMovida: number
}

/** Un renglón del listado de "Datos del comercio": UN cliente con lo que tiene cargado hoy.
 *  `valores` trae los CÓDIGOS del catálogo (`'3'`, `'ford'`), no sus labels — la traducción
 *  la hace la tabla con `useCamposFicha`, el mismo catálogo que dibuja el formulario del
 *  vendedor. Un valor que no matchee ningún código es el texto de la opción abierta. */
export interface IFichaRelevadaFila {
    codigoParticularCliente: string
    /** '' si el warehouse estaba caído: el listado no depende de él para existir. */
    nombreCliente: string
    valores: Record<string, string[]>
    codigoParticularVendedor: string
    nombreVendedor: string
    /** ISO en UTC del dato MÁS RECIENTE del cliente. La hora visible sale de `horaNegocio`. */
    relevadoEn: string
}

export interface IFichasRelevadasResponse {
    total: number
    /** Clientes distintos en las rotaciones abiertas del filtro: el denominador de
     *  "124 de 380 clientes del plan relevados". */
    totalPlan: number
    fichas: IFichaRelevadaFila[]
}

/** El filtro de esta pantalla: el período es OPCIONAL (la ficha es un padrón acumulado, no
 *  actividad), a diferencia de `IAnaliticaFiltro`. */
export interface IFichasArgs {
    desde?: string
    hasta?: string
    vendedores?: string[]
}
