import { formatNumero } from '@/lib/analiticaFormat'
import type { IMetricasFila } from '@/types/metricas'

/** Objetivos de venta MENSUALES por vendedor. No existen en ninguna tabla: son constantes
 *  a propósito hasta que gerencia defina metas reales (spec 2026-09-24, §3). El 12 de
 *  super rubro viene del mockup y es chico para el SR de la empresa: ajustarlo al ver datos. */
export const OBJETIVOS_VENTA_POR_VENDEDOR = { facturacionM: 150, unidades: 500, superRubro: 12 } as const
export const OBJETIVO_TASA_CIERRE = 0.6

/** Mismo criterio que pl_objetivo en el backend: mes completo usa el objetivo tal cual; si
 *  no, se prorratea sobre un mes típico de 22 días hábiles. */
const DIAS_HABILES_MES_TIPICO = 22

export function objetivosVenta(cantidadVendedores: number, diasHabiles: number, mesCompleto: boolean) {
    const factor = (mesCompleto ? 1 : diasHabiles / DIAS_HABILES_MES_TIPICO) * cantidadVendedores
    return {
        facturacion: OBJETIVOS_VENTA_POR_VENDEDOR.facturacionM * 1_000_000 * factor,
        unidades: OBJETIVOS_VENTA_POR_VENDEDOR.unidades * factor,
        superRubro: OBJETIVOS_VENTA_POR_VENDEDOR.superRubro * factor,
    }
}

export const razon = (num: number, den: number): number | null => (den > 0 ? num / den : null)

export const cumplimiento = (real: number, objetivo: number | null): number | null =>
    objetivo === null ? null : razon(real, objetivo)

export const variacion = (actual: number, anterior: number): number | null =>
    anterior > 0 ? (actual - anterior) / anterior : null

export const factorProyeccion = (diasHabiles: number, transcurridos: number): number =>
    transcurridos > 0 ? diasHabiles / transcurridos : 1

const ACUMULADOS: (keyof IMetricasFila)[] = [
    'visitasValidas', 'minutosTotales', 'facturacion', 'unidades', 'superRubro', 'planificadosConCompra',
]
const CONTEOS_CLIENTES: (keyof IMetricasFila)[] = ['clientesVisitados', 'clientesConCompra', 'visitadosConCompra']

/** "Ver proyectado": escala lo acumulado al ritmo de los días hábiles transcurridos. Los
 *  conteos de clientes no pueden superar la cartera; los ratios, objetivos y el año
 *  anterior no se tocan. */
export function proyectar(fila: IMetricasFila, factor: number): IMetricasFila {
    const p = { ...fila }
    for (const k of ACUMULADOS) (p[k] as number) = (fila[k] as number) * factor
    for (const k of CONTEOS_CLIENTES) (p[k] as number) = Math.min(Math.round((fila[k] as number) * factor), fila.cartera)
    return p
}

export const formatMillones = (pesos: number): string => formatNumero(pesos / 1_000_000)

export function claseCumplimiento(pct: number | null): string {
    if (pct === null) return 'text-slate-400'
    if (pct < 0.5) return 'text-red-600'
    if (pct < 1) return 'text-amber-600'
    return 'text-emerald-600'
}

/** Trazo del anillo de cumplimiento. Clases literales (no `bg-→stroke-` armado en runtime):
 *  Tailwind solo genera las clases que encuentra escritas en el código. */
export function claseAnillo(pct: number | null): string {
    if (pct === null) return 'stroke-slate-200'
    if (pct < 0.5) return 'stroke-red-500'
    if (pct < 1) return 'stroke-amber-500'
    return 'stroke-emerald-500'
}
