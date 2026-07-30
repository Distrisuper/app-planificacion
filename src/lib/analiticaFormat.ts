/** Tolerancia heredada de api-mobiliza (TOLERANCIA_GEOLOCALIZACION). Inclusive. */
export const TOLERANCIA_METROS = 300

/** Un valor está en rojo si cae por debajo del 70% del promedio del equipo. */
const PISO_RELATIVO = 0.7

/** Piso absoluto de duración, heredado de mobiliza. */
const PISO_DURACION_MIN = 20

/** s/d en vez de 0%: un dato ausente no es un cero. */
export const formatPct = (valor: number | null): string =>
    valor === null ? 's/d' : `${Math.round(valor * 100)}%`

export const formatNumero = (valor: number | null): string => {
    if (valor === null) return 's/d'
    const redondeado = Math.round(valor * 10) / 10
    return Number.isInteger(redondeado)
        ? String(redondeado)
        : String(redondeado).replace('.', ',')
}

export const formatDistancia = (metros: number | null): string =>
    metros === null ? 's/d' : `${Math.round(metros)} m`

export const formatDuracion = (minutos: number | null): string =>
    minutos === null ? 's/d' : `${Math.round(minutos)} min`

export type ClaseDistancia = 'ok' | 'alerta' | 'neutro'

/** Sin coord del cliente la visita no es verificable: se muestra neutra, no en rojo.
 *  Castigarla haría que el indicador mida la calidad de fct_clients, no el trabajo. */
export const claseDistancia = (metros: number | null): ClaseDistancia => {
    if (metros === null) return 'neutro'
    return metros <= TOLERANCIA_METROS ? 'ok' : 'alerta'
}

export const esBajoPromedio = (valor: number | null, promedio: number | null): boolean => {
    if (valor === null || promedio === null || promedio <= 0) return false
    return valor < promedio * PISO_RELATIVO
}

export type AlertaAbsoluta = 'duracion' | 'geo'

/** Las dos reglas que no dependen del equipo: si todo el equipo hace visitas de
 *  10 minutos, el semáforo relativo no marcaría a nadie. */
export const alertasAbsolutas = (v: {
    duracionPromedioMin: number | null
    visitasTotales: number
    visitasNoValidadas: number
}): AlertaAbsoluta[] => {
    const alertas: AlertaAbsoluta[] = []
    if (v.duracionPromedioMin !== null && v.duracionPromedioMin < PISO_DURACION_MIN) {
        alertas.push('duracion')
    }
    if (v.visitasTotales > 0 && v.visitasNoValidadas >= v.visitasTotales * 0.5) {
        alertas.push('geo')
    }
    return alertas
}
