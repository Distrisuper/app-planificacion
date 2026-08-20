/** Formatea en YYYY-MM-DD usando los componentes LOCALES de la fecha.
 *
 *  No usar toISOString().slice(0,10): convierte a UTC, así que en Argentina
 *  (UTC−3) a partir de las 21:00 devuelve el día siguiente. El dashboard mostraría
 *  "mañana" —vacío— mientras el vendedor todavía está cargando visitas. */
export const isoLocal = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function rangoHoy(): { desde: string; hasta: string } {
    const hoy = isoLocal(new Date())
    return { desde: hoy, hasta: hoy }
}

/** Si el rango llega hasta hoy o más allá, los datos todavía se están moviendo:
 *  es lo que habilita el auto-refresh en la vista de actividad. */
export function incluyeHoy(desde: string, hasta: string): boolean {
    const hoy = isoLocal(new Date())
    return desde <= hoy && hasta >= hoy
}

/**
 * Timezone de negocio. La hora que se muestra es la que vivió el vendedor en
 * Argentina, no la del dispositivo de quien mira el dashboard: gerencia de viaje o
 * una notebook con la TZ mal configurada no pueden correr los horarios del equipo.
 *
 * Por eso NO se usa `toLocaleTimeString()` pelado ni `slice(11, 16)` sobre el ISO
 * —eso último devuelve UTC, que es como se llegó a mostrar 15:07 para una visita de
 * las 12:07.
 */
export const TZ_NEGOCIO = 'America/Argentina/Buenos_Aires'

const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_NEGOCIO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

/** HH:mm en hora argentina a partir de un instante ISO 8601. null → '—'. */
export function horaNegocio(iso: string | null | undefined): string {
    if (!iso) return '—'
    const instante = new Date(iso)
    if (Number.isNaN(instante.getTime())) return '—'
    // es-AR emite '24:00' para medianoche en algunos runtimes.
    return FORMATO_HORA.format(instante).replace(/^24:/, '00:')
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_NEGOCIO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

/**
 * 'DD/MM HH:mm' en hora argentina a partir de un instante ISO 8601. null → '—'.
 *
 * Mismo motivo que `horaNegocio`: el backend manda instantes en UTC, y tanto
 * `slice()` sobre el ISO como `toLocaleString()` pelado mostrarían otra hora (Greenwich
 * el primero, la del dispositivo el segundo — una notebook de gerencia con otra TZ
 * correría los horarios de todo el equipo).
 *
 * No usa `FORMATO_FECHA_HORA.format()` pelado: el ICU de algunos runtimes (Node 22 entre
 * ellos) no rellena `month: '2-digit'` con cero cuando comparte formato con hora/minuto
 * — "8" en vez de "08". Se arma el string a mano desde `formatToParts()`, con padding
 * propio, para no depender de ese detalle de la implementación.
 */
export function fechaHoraNegocio(iso: string | null | undefined): string {
    if (!iso) return '—'
    const instante = new Date(iso)
    if (Number.isNaN(instante.getTime())) return '—'
    const partes = Object.fromEntries(
        FORMATO_FECHA_HORA.formatToParts(instante).map(p => [p.type, p.value]),
    )
    const pad2 = (v: string) => v.padStart(2, '0')
    // es-AR emite '24:00' para medianoche en algunos runtimes.
    const hora = partes.hour === '24' ? '00' : pad2(partes.hour)
    return `${pad2(partes.day)}/${pad2(partes.month)} ${hora}:${pad2(partes.minute)}`
}

/** Primer y último día del mes calendario que contiene `fecha`, en formato YYYY-MM-DD.
 *  Es el filtro que usa el bloque de Efectividad: siempre mes completo,
 *  nunca un rango libre. */
export function rangoMes(fecha: Date): { desde: string; hasta: string } {
    const anio = fecha.getFullYear()
    const mes = fecha.getMonth()
    return {
        desde: isoLocal(new Date(anio, mes, 1)),
        // Día 0 del mes siguiente = último día de este mes.
        hasta: isoLocal(new Date(anio, mes + 1, 0)),
    }
}

/** Lunes y viernes de la semana calendario que contiene `fecha`, en formato YYYY-MM-DD.
 *  Es el otro rango que ofrece el selector de Efectividad, alternativo a `rangoMes`. */
export function rangoSemana(fecha: Date): { desde: string; hasta: string } {
    const diaSemana = fecha.getDay() === 0 ? 7 : fecha.getDay()
    const lunes = new Date(fecha)
    lunes.setDate(fecha.getDate() - (diaSemana - 1))
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    return { desde: isoLocal(lunes), hasta: isoLocal(viernes) }
}

/** "18/08 al 22/08". Mismo criterio manual que `nombreMes`: no depender del locale del runtime. */
export function nombreSemana(fecha: Date): string {
    const { desde, hasta } = rangoSemana(fecha)
    const corto = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
    return `${corto(desde)} al ${corto(hasta)}`
}

const NOMBRES_MES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "Agosto 2026". Se arma a mano (no con Intl) para no depender de que el locale
 *  del runtime devuelva "agosto de 2026" o algo distinto según la plataforma. */
export function nombreMes(fecha: Date): string {
    const nombre = NOMBRES_MES[fecha.getMonth()]
    return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${fecha.getFullYear()}`
}
