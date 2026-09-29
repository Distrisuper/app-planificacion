import { isoLocal } from '@/lib/fechas'

/** null en vez de 0 cuando no hay denominador: un dato ausente no es un cero. */
export const razon = (num: number, den: number | null): number | null =>
    den !== null && den > 0 ? num / den : null

/** Variación contra el mismo período del año anterior (MMAA). Sin base no hay variación. */
export const variacion = (actual: number, anterior: number): number | null =>
    anterior > 0 ? (actual - anterior) / anterior : null

export type Tono = 'ok' | 'medio' | 'bajo' | 'neutro'

/** Semáforo de un cumplimiento 0..1+. */
export const tonoCumplimiento = (pct: number | null): Tono => {
    if (pct === null) return 'neutro'
    if (pct >= 0.8) return 'ok'
    if (pct >= 0.5) return 'medio'
    return 'bajo'
}

export const formatPct = (valor: number | null): string =>
    valor === null ? 's/d' : `${Math.round(valor * 100)}%`

export const formatVariacion = (valor: number | null): string => {
    if (valor === null) return 's/d'
    const redondeado = Math.round(valor * 100)
    return `${redondeado > 0 ? '+' : ''}${redondeado}%`
}

const conComa = (n: number) => {
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}

export const formatEntero = (n: number): string => Math.round(n).toLocaleString('es-AR')

export const formatHoras = (minutos: number): string => conComa(minutos / 60)

/** Pesos → "132,4" (en millones). La unidad ($M) la pinta el llamador. */
export const formatMillones = (pesos: number): string => conComa(pesos / 1_000_000)

/**
 * Rango del mes que contiene `mes`. El mes en curso corta en `hoy` y no en el último
 * día: el MMAA del backend se calcula sobre el MISMO rango un año atrás, así que pedir el
 * mes entero compararía 28 días de este año contra 30 del anterior.
 */
export function rangoDelMes(mes: Date, hoy: Date = new Date()): { desde: string; hasta: string; enCurso: boolean } {
    const desde = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const enCurso = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth()
    return { desde: isoLocal(desde), hasta: isoLocal(enCurso ? hoy : fin), enCurso }
}
