/** Radio dentro del cual se puede iniciar una visita, medido contra la coord del cliente.
 *  Gate operativo del INICIO — no confundir con `TOLERANCIA_METROS` de `analiticaFormat.ts`,
 *  que es el umbral de MEDICIÓN post-hoc que usa Efectividad (ahí sí sobre inicio y cierre).
 *  Hoy coinciden en 100 m, pero son conceptos distintos: uno bloquea una acción del vendedor
 *  en el momento, el otro clasifica una visita ya cerrada. No unificar la constante — que
 *  cambien juntas hoy es casualidad, no un invariante del dominio. */
export const RADIO_INICIO_METROS = 100

const RADIO_TIERRA_M = 6_371_000

/** Distancia en línea recta entre dos coordenadas (haversine), en metros. */
export function distanciaMetros(latA: number, lonA: number, latB: number, lonB: number): number {
    const toRad = (grados: number) => (grados * Math.PI) / 180
    const dLat = toRad(latB - latA)
    const dLon = toRad(lonB - lonA)
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2
    return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a))
}

/**
 * Si el fix está lo bastante lejos del cliente como para bloquear el inicio.
 *
 * No alcanza con `distanciaM > RADIO_INICIO_METROS`: un fix de wifi/antena (precisión de
 * cientos de metros, la segunda etapa de `capturarUbicacion()` bajo techo) puede marcar
 * 400 m sin que eso pruebe nada — el vendedor bien puede estar parado en el local. Se
 * bloquea solo cuando la distancia SUPERA la tolerancia incluso descontando el margen de
 * error del propio fix: evidencia positiva de lejanía, no ausencia de prueba de cercanía.
 */
export function estaFueraDeRango(distanciaM: number, precisionM: number): boolean {
    return distanciaM - precisionM > RADIO_INICIO_METROS
}
