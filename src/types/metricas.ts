/** Espejo de api-vendedores src/types/metricas.ts. Porcentajes en 0..1. */
export interface IMetricaObjetivo { actual: number; objetivo: number | null; anterior: number | null }
export interface IMetricaComparacion { actual: number | null; anterior: number | null }
export interface IFilaLista { etiqueta: string; valor: number }
export type EstadoCliente = 'Activo' | 'Pasivo' | 'Inactivo' | 'Crítico'

export interface ISujetoMetricas { tipo: 'vendedor' | 'equipo'; codigo: string | null; nombre: string }

export interface IMetricasVentas {
    facturacion: IMetricaObjetivo
    unidades: IMetricaObjetivo
    superRubros: IMetricaObjetivo
    clientesPorEstado: { etiqueta: EstadoCliente; valor: number }[]
    clientesEnCaida: IFilaLista[]
}

export interface IMetricas {
    mes: string
    sujeto: ISujetoMetricas
    actualizadoEn: string
    fuentes: { ventas: 'ok' | 'no_disponible' | 'no_aplica' }
    visitas: IMetricaObjetivo
    clientesVisitados: IMetricaObjetivo
    minutos: IMetricaObjetivo
    efectividadOperativa: IMetricaComparacion
    cobertura: IMetricaComparacion
    efectividadComercial: IMetricaComparacion & { ofrecidos: number; ganados: number; diferidos: number; perdidos: number }
    objeciones: { total: number; top: IFilaLista[] }
    ventas: IMetricasVentas | null
}

export interface IMetricaCliente {
    codigoParticularCliente: string
    nombre: string
    actual: number
    promedio6m: number
    variacion: number | null
}
