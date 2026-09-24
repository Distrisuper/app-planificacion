export const TRAMOS = ['sinCompras', 'menos1M', 'entre1y3M', 'entre3y5M', 'mas5M'] as const
export type Tramo = (typeof TRAMOS)[number]

export interface IFiltroMetricas {
    desde: string
    hasta: string
    /** Vendedor elegido. Ausente = equipo completo del scope. */
    vendedor?: string
    /** BA | MDP | PICO | ROSARIO — la sucursal de la FACTURA. */
    sucursal?: string
    zona?: string
    localidad?: string
}

/** Un cliente de la cartera, ya con su sucursal dominante resuelta. Códigos en MAYÚSCULAS. */
export interface IClienteConjunto {
    codigo: string
    vendedor: string
    nombre: string
    direccion: string | null
    telefono: string | null
    localidad: string | null
    zona: string | null
    /** La que más le facturó en los 12 meses cerrados. null = sin compras en ese lapso. */
    sucursal: string | null
}

/** Una fila del ranking (y la de equipo). Todos crudos: los % los calcula el front. */
export interface IMetricasFila {
    codigoVendedor: string
    nombreVendedor: string
    cartera: number
    clientesVisitados: number
    visitasValidas: number
    minutosTotales: number
    clientesConCompra: number
    /** Clientes visitados en el período que además compraron: numerador de la tasa de cierre. */
    visitadosConCompra: number
    planificados: number
    /** Filas del plan cuyo cliente compró en el período: numerador de Ventas vs Planner. */
    planificadosConCompra: number
    facturacion: number
    facturacionMmaa: number
    unidades: number
    unidadesMmaa: number
    superRubro: number
    superRubroMmaa: number
    /** 0..1. null fuera de mes calendario completo o sin venta rentable. */
    rentabilidad: number | null
    /** Objetivos de pl_objetivo ya prorrateados al período. null = sin objetivo vigente. */
    objetivoVisitas: number | null
    objetivoClientes: number | null
    objetivoMinutos: number | null
}

export interface IMetricasResumen {
    desde: string
    hasta: string
    diasHabiles: number
    /** Días hábiles entre `desde` y hoy (o `hasta` si ya pasó). Alimenta la proyección. */
    diasHabilesTranscurridos: number
    mesCompleto: boolean
    equipo: IMetricasFila
    vendedores: IMetricasFila[]
}

export interface IObjecionesMetricas {
    total: number
    planificados: number
    motivos: { motivoId: number; descripcion: string; cantidad: number; pct: number }[]
}

export interface IConteo {
    descripcion: string
    cantidad: number
    pct: number
}

export interface IPagina<T> {
    total: number
    pagina: number
    cant: number
    filas: T[]
}

export interface IClienteObjecion {
    codigo: string
    nombre: string
    direccion: string | null
    telefono: string | null
    localidad: string | null
    vendedor: string
}

export interface IObjecionDetalle {
    motivoId: number
    descripcion: string
    marcas: IConteo[]
    rubros: IConteo[]
    clientes: IPagina<IClienteObjecion>
}

export interface ICategoriasMetricas {
    /** 'YYYY-MM' del mes clasificado (el de `hasta`). */
    mes: string
    tramos: { tramo: Tramo; cantidad: number }[]
    subieron: number
    bajaron: number
}

export interface IClienteTramo {
    codigo: string
    nombre: string
    actual: number
    promedio6m: number
    /** (actual − promedio6m) / promedio6m. null si promedio6m ≤ 0. */
    variacion: number | null
}

export type IClientesDeTramo = IPagina<IClienteTramo>

export interface IOpcionesMetricas {
    sucursales: { codigo: string; descripcion: string }[]
    zonas: { codigo: string; descripcion: string }[]
    localidades: { localidad: string; zona: string | null }[]
}
