/**
 * Contrato de `GET /planificacion/mis-metricas?desde&hasta`. Espejo de `IMisMetricas` en
 * `src/types/metricas.ts` de api-vendedores: cambiar uno obliga a cambiar el otro.
 * Es la fila de un solo vendedor de `IMetricasFila` de `/analitica/metricas/resumen`,
 * sin `equipo` ni ranking: el código de vendedor sale del token, nunca de un parámetro.
 * Todo viaja crudo: los % los calcula el front (`src/lib/misMetricas.ts`).
 */
export interface IMisMetricas {
    desde: string
    hasta: string
    diasHabiles: number
    diasHabilesTranscurridos: number
    mesCompleto: boolean
    /** true = vendedor de prueba (`PRUEBA-*`): no existe en el warehouse, así que las
     *  ventas vienen en cero y no hay que dibujarlas como un 0% real. */
    sinVentas: boolean

    cartera: number
    /** Clientes DE LA CARTERA con alguna visita cerrada: numerador de % de cartera visitada
     *  y de la tasa de cierre. No es el número contra el objetivo. */
    clientesVisitados: number
    /** Clientes distintos con al menos una visita VÁLIDA, sin recorte por cartera: el mismo
     *  número que ve gerencia en Analítica, y el que se compara contra `objetivoClientes`. */
    clientesDistintos: number
    clientesConCompra: number
    /** Clientes visitados que además compraron: numerador de la tasa de cierre. */
    visitadosConCompra: number
    visitasValidas: number
    minutosTotales: number
    planificados: number
    /** Filas del plan cuyo cliente compró en el período: numerador de Ventas vs planificación. */
    planificadosConCompra: number

    facturacion: number
    facturacionMmaa: number
    unidades: number
    unidadesMmaa: number
    superRubro: number
    superRubroMmaa: number

    /** De `pl_objetivo`, ya prorrateados al período. null = sin objetivo vigente. */
    objetivoVisitas: number | null
    objetivoClientes: number | null
    objetivoMinutos: number | null

    /** null: sin objetivo publicado para su cartera, vendedor de prueba o error al leerlo.
     *  Opcional porque un back viejo no lo manda: en los dos casos no se muestra la tarjeta. */
    objetivoVentas?: IObjetivoVentas | null
}

export type NivelPremio = 'ninguno' | 'std' | 'oro' | 'platino'

/**
 * Objetivo de venta del mes de la cartera del vendedor (`pl_obj_valor`). Es del EQUIPO: el
 * vendedor y los TV de su cartera (`tvs`) comisionan juntos si la cartera llega a un nivel.
 * Montos nominales (sin ajuste por inflación).
 */
export interface IObjetivoVentas {
    /** 'YYYY-MM' */
    mes: string
    std: number
    oro: number
    platino: number
    /** La misma facturación del mes que `facturacion`. */
    real: number
    /** real / std */
    avance: number | null
    premio: { nivel: NivelPremio; siguiente: Exclude<NivelPremio, 'ninguno'> | null; falta: number | null }
    /** TV activos de su cartera; [] si no tiene. */
    tvs: { codigo: string; nombre: string }[]
}
