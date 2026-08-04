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
