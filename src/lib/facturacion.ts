import { proyectarMes } from './proyeccionVentas'
import type { IVentasVendedor, PeriodoVentas } from '@/types/metricasEquipo'

/** U = unidades, $ = pesos (monto nominal), SR = super rubros con el mínimo cumplido. */
export type VistaVentas = 'u' | '$' | 'sr'

/** Las columnas de Facturación, como en Versus: el mes (ACTUAL o PROY), M.ANT y los
 *  promedios MENSUALES de 3, 6 y 12 meses. P.6M es la referencia de los colores. */
export type ColumnaVentas = 'actual' | 'mant' | 'p3m' | 'p6m' | 'p12m'

export const COLUMNAS: { id: ColumnaVentas; periodo: PeriodoVentas; meses: number }[] = [
    { id: 'actual', periodo: 'thisMonth', meses: 1 },
    { id: 'mant', periodo: 'lastMonth', meses: 1 },
    { id: 'p3m', periodo: 'last3Months', meses: 3 },
    { id: 'p6m', periodo: 'last6Months', meses: 6 },
    { id: 'p12m', periodo: 'last12Months', meses: 12 },
]

const leer = (v: IVentasVendedor, periodo: PeriodoVentas, vista: VistaVentas): number => {
    const p = v.totalsByPeriod[periodo]
    if (!p) return 0
    if (vista === 'u') return p.units
    if (vista === 'sr') return p.sr ?? 0
    return p.amount
}

/** El valor de una columna: el total del período dividido por sus meses (P.3M es un
 *  promedio mensual, no el acumulado de 3 meses). */
export function valorColumna(v: IVentasVendedor, columna: ColumnaVentas, vista: VistaVentas): number {
    const c = COLUMNAS.find(x => x.id === columna)!
    return leer(v, c.periodo, vista) / c.meses
}

/** La fila TOTALES: la suma de las carteras, período por período. */
export function sumarVendedores(vendedores: IVentasVendedor[]): IVentasVendedor {
    const totalsByPeriod: IVentasVendedor['totalsByPeriod'] = {}
    for (const { periodo } of COLUMNAS) {
        let units = 0
        let amount = 0
        let sr = 0
        for (const v of vendedores) {
            const p = v.totalsByPeriod[periodo]
            if (!p) continue
            units += p.units
            amount += p.amount
            sr += p.sr ?? 0
        }
        totalsByPeriod[periodo] = { units, amount, sr }
    }
    return { code: '__TOTALES__', name: 'TOTALES', totalsByPeriod }
}

export type TonoCelda = 'sin_valor' | 'alto' | 'ok' | 'atencion' | 'bajo' | 'critico'

/** Umbrales de Versus (app-vendedores src/utils/cellColorV2.ts), sobre valor / P.6M. */
const UMBRAL = { alto: 1.3, ok: 0.9, atencion: 0.7, bajo: 0.2 } as const

/** El tono de una celda contra la referencia P.6M (los dos ya como promedio mensual). */
export function tonoCelda(valor: number, ref6m: number): TonoCelda {
    if (valor === 0) return 'sin_valor'
    // Sin referencia, o con devoluciones netas en 6M: vender es recuperar; seguir negativo, crítico.
    if (ref6m <= 0) return valor > 0 ? 'alto' : 'critico'
    const ratio = valor / ref6m
    if (ratio < 0) return 'critico'
    if (ratio >= UMBRAL.alto) return 'alto'
    if (ratio >= UMBRAL.ok) return 'ok'
    if (ratio >= UMBRAL.atencion) return 'atencion'
    if (ratio >= UMBRAL.bajo) return 'bajo'
    return 'critico'
}

export type TonoMes = 'alto' | 'ok' | 'atencion' | 'bajo' | 'critico'

/**
 * El tono del mes en curso con la escala de la tabla clásica de app-vendedores
 * (src/utils/getColorClass.tsx): SIEMPRE lleva color, también cerca de la referencia, donde
 * las columnas de períodos cerrados no se pintan. Recibe el valor ya proyectado al cierre.
 * - rojo: sin ventas (≤ 0) o menos del 20% de P.6M;
 * - naranja: menos del 70%; amarillo: menos del 90%;
 * - verde suave: entre 90% y 110%; verde fuerte: más del 110%.
 * Sin referencia (o con devoluciones netas en 6M), vender cualquier cosa ya es verde fuerte.
 */
export function tonoMesProyectado(proyectado: number, ref6m: number): TonoMes {
    if (proyectado <= 0 || proyectado < ref6m * 0.2) return 'critico'
    if (proyectado < ref6m * 0.7) return 'bajo'
    if (proyectado < ref6m * 0.9) return 'atencion'
    if (proyectado <= ref6m * 1.1) return 'ok'
    return 'alto'
}

/** El tono del mes en curso: se compara su PROYECCIÓN al cierre contra P.6M, aunque la celda
 *  muestre lo vendido hasta hoy (la misma regla que Versus). Un mes a medias contra el promedio
 *  de meses enteros saldría rojo por construcción. */
export const tonoDelMes = (vendidoHastaHoy: number, ref6m: number, ahora: Date = new Date()): TonoMes =>
    tonoMesProyectado(proyectarMes(vendidoHastaHoy, ahora), ref6m)

/** Los mismos fondos que getColorClass de app-vendedores. */
export const CLASE_TONO_MES: Record<TonoMes, string> = {
    alto: 'bg-green-400 text-green-950 font-semibold',
    ok: 'bg-green-300 text-green-950 font-semibold',
    atencion: 'bg-yellow-200 text-yellow-900 font-semibold',
    bajo: 'bg-orange-300 text-orange-950 font-semibold',
    critico: 'bg-red-200 text-red-950 font-semibold',
}

export const CLASE_TONO: Record<TonoCelda, string> = {
    sin_valor: 'text-slate-400',
    alto: 'bg-green-100 text-green-900 font-semibold',
    ok: 'text-slate-900 font-semibold',
    atencion: 'bg-yellow-100 text-yellow-800 font-semibold',
    bajo: 'bg-orange-300 text-orange-900 font-semibold',
    critico: 'bg-[#fb8a8a] text-red-950 font-semibold',
}

const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Pesos y unidades enteros con separador de miles; SR con un decimal si hace falta
 *  (un promedio de super rubros no es entero). */
export function formatVentas(valor: number, vista: VistaVentas): string {
    if (vista === 'sr') {
        return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(valor)
    }
    return ENTERO.format(Math.round(valor))
}
