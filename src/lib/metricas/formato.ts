export type Formato = 'numero' | 'porcentaje' | 'horas' | 'pesosMillones' | 'unidades'
export type Semaforo = 'rojo' | 'ambar' | 'verde'

const AR = 'es-AR'
const entero = (n: number) => Math.round(n).toLocaleString(AR)
const unDecimal = (n: number) => n.toLocaleString(AR, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Un solo lugar para el formato de cada tile. `null` → 's/d', como en analítica. */
export function formatearValor(formato: Formato, valor: number | null): string {
    if (valor === null) return 's/d'
    switch (formato) {
        case 'numero': return entero(valor)
        case 'porcentaje': return `${Math.round(valor * 100)}%`
        case 'horas': {
            const hs = valor / 60
            return `${Number.isInteger(hs) ? entero(hs) : unDecimal(hs)} hs`
        }
        case 'pesosMillones': return `$${unDecimal(valor / 1_000_000)}M`
        case 'unidades': return `${entero(valor)} u.`
    }
}

/** Umbrales del panel de gerencia que sirvió de referencia: <50% rojo, <75% ámbar. */
export function semaforo(actual: number, objetivo: number): Semaforo {
    const pct = objetivo > 0 ? (actual / objetivo) * 100 : 0
    return pct < 50 ? 'rojo' : pct < 75 ? 'ambar' : 'verde'
}

export function variacion(actual: number | null, anterior: number | null): number | null {
    if (actual === null || anterior === null || anterior === 0) return null
    return (actual - anterior) / anterior
}

export function formatearVariacion(v: number | null): string {
    if (v === null) return ''
    const pct = Math.round(Math.abs(v) * 100)
    if (pct === 0) return '= 0%'
    return `${v > 0 ? '▲' : '▼'} ${pct}%`
}
