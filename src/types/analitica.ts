import type { IAlcance, ResultadoMotivo, TipoOfrecimiento, TipoResolucion } from './planificacion'

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
    /** Duración < 20 min. Informativo: no se resta de visitasValidas. */
    visitasCortas: number
    /** Promedio solo sobre visitas válidas. null si no hay ninguna. */
    duracionPromedioMin: number | null
    minutosTotales: number
    visitasPorDia: number
    clientesDistintos: number

    // Objetivos (pl_objetivo). null = sin objetivo vigente → la UI muestra s/d.
    pctCumplimientoClientes: number | null
    pctCumplimientoMinutos: number | null
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
    /** null = cliente sin coords → se muestra 's/d', nunca un número absurdo. */
    distanciaMetros: number | null
    codigoParticularCliente: string
    nombreCliente: string
    codigoParticularVendedor: string
    nombreVendedor: string
    tipo: TipoResolucion
    /** Descripciones de los motivos, ya resueltas contra el catálogo. */
    motivos: string[]
    /** Resultado dominante de los ofrecimientos de la visita. null si no hay ninguno resuelto. */
    resultado: ResultadoMotivo | null
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
    pagina?: number
    cant?: number
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
    distanciaMetros: number | null
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
