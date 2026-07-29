function key(visitaId: number): string {
    return `visita-inicio-${visitaId}`
}

/** Se llama apenas la mutación de iniciar tiene éxito, para que el cronómetro sobreviva a
 *  cerrar/reabrir el sheet dentro de la misma sesión. */
export function marcarInicioVisita(visitaId: number): void {
    if (localStorage.getItem(key(visitaId)) != null) return
    localStorage.setItem(key(visitaId), String(Date.now()))
}

export function limpiarInicioVisita(visitaId: number): void {
    localStorage.removeItem(key(visitaId))
}

/** null si no se registró un inicio para esta visita (p.ej. se abrió recién en otra sesión). */
export function segundosTranscurridos(visitaId: number): number | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    const inicio = Number(raw)
    if (Number.isNaN(inicio)) return null
    return Math.max(0, Math.floor((Date.now() - inicio) / 1000))
}

export function formatearDuracion(totalSegundos: number): string {
    const minutos = Math.floor(totalSegundos / 60)
    const segundos = totalSegundos % 60
    return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`
}
