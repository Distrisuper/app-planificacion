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
}
