import type { TipoOfrecimiento } from '@/types/planificacion'

/** Radio máximo entre la coord capturada (inicio o fin) y la del cliente para que esa
 *  pata de la visita cuente como verificada. Inclusive. */
export const TOLERANCIA_METROS = 100

/** Rango de duración de una visita válida. Inclusive en ambos extremos. */
export const DURACION_MIN_VALIDA = 10
export const DURACION_MAX_VALIDA = 90

/** Etiqueta del chip de tipo en la analítica. Un solo lugar: DetalleVisitaPanel y
 *  TablaVisitas lo comparten para no divergir. 'rubro' no se usa como chip — es el
 *  caso por defecto y no se pinta. */
export const TIPO_LABEL: Record<TipoOfrecimiento, string> = {
    rubro: 'Rubro',
    marca: 'Marca',
    linea: 'Línea',
    articulo: 'Artículo',
    accion: 'Acción',
}

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
 *  Castigarla haría que el indicador mida la calidad de fct_clients, no el trabajo.
 *  Con ambas patas presentes, la que decide es la peor: alcanza con que una se pase
 *  de la tolerancia para que la visita no sea válida. */
export const claseDistancia = (
    inicioMetros: number | null,
    finMetros: number | null,
): ClaseDistancia => {
    const valores = [inicioMetros, finMetros].filter((m): m is number => m !== null)
    if (valores.length === 0) return 'neutro'
    return valores.some(m => m > TOLERANCIA_METROS) ? 'alerta' : 'ok'
}

/** Una visita es válida cuando ambas patas están dentro de la tolerancia de distancia
 *  y la duración cae en [DURACION_MIN_VALIDA, DURACION_MAX_VALIDA]. */
export const esDuracionValida = (minutos: number | null): boolean =>
    minutos !== null && minutos >= DURACION_MIN_VALIDA && minutos <= DURACION_MAX_VALIDA

/** La pata que más se aleja del cliente, para mostrar un solo número en tablas que no
 *  tienen lugar para las dos. null solo si ninguna de las dos tiene dato. */
export const peorDistancia = (inicioMetros: number | null, finMetros: number | null): number | null => {
    const valores = [inicioMetros, finMetros].filter((m): m is number => m !== null)
    return valores.length === 0 ? null : Math.max(...valores)
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

/** efectividadOperativa ya viene en escala 0..100 (no 0..1 como el resto de los %
 *  de esta pantalla) — puede superar 100 cuando el vendedor supera la meta.
 *  `!Number.isFinite` cubre además `undefined`/`NaN`: un campo que la API todavía no
 *  manda (ej. pctCumplimientoVisitas antes de que exista en api-vendedores) no debe
 *  mostrar "NaN%". */
export const formatPctEscalado = (valor: number | null | undefined): string =>
    valor === null || valor === undefined || !Number.isFinite(valor) ? 's/d' : `${Math.round(valor)}%`

export const formatHoras = (minutos: number | null): string =>
    minutos === null ? 's/d' : `${formatNumero(minutos / 60)} hs`
