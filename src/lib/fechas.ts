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
