import type { ResultadoMotivo, TipoResolucion } from './planificacion'

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
    rubrosOfrecidos: number
    rubrosGanados: number
    rubrosDiferidos: number
    rubrosPerdidos: number
    /** 0..1 = ganados/ofrecidos. null si rubrosOfrecidos === 0. */
    efectividadComercial: number | null
    /** 0..1 = propuestos que se cerraron sin ofrecer. null si no hubo propuestos. */
    pctNoOfrecidos: number | null
    /** Rubros sin resolver en visitas ya cerradas. Mide calidad del dato. */
    rubrosSinResolver: number
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
    /** YYYY-MM-DD */
    fecha: string
    /** HH:mm */
    horaInicio: string
    horaFin: string | null
    duracionMin: number | null
    /** null = cliente sin coords → se muestra 's/d', nunca un número absurdo. */
    distanciaMetros: number | null
    codigoParticularCliente: string
    nombreCliente: string
    tipo: TipoResolucion
    /** Descripciones de los motivos, ya resueltas contra el catálogo. */
    motivos: string[]
    /** Resultado dominante de los rubros de la visita. null si no hay rubros resueltos. */
    resultado: ResultadoMotivo | null
}

export interface IVisitasPage {
    total: number
    pagina: number
    cant: number
    visitas: IVisitaFila[]
}

export interface IVisitaRubroMotivoDetalle {
    descripcion: string
    resultado: ResultadoMotivo | null
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

export interface IVisitaRubroDetalle {
    rubroCode: string
    rubroDescripcion: string
    esPropuesto: boolean
    resuelto: boolean
    motivos: IVisitaRubroMotivoDetalle[]
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
    rubros: IVisitaRubroDetalle[]
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
