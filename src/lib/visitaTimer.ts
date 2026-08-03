function key(visitaId: number): string {
    return `visita-inicio-${visitaId}`
}

/** Se llama exactamente una vez, apenas la mutación de iniciar tiene éxito — nunca al
 *  reabrir una visita que ya estaba en curso (eso no vuelve a llamar a esta función,
 *  sigue leyendo el timestamp que ya había). Por eso SIEMPRE pisa el valor anterior:
 *  antes tenía un guard "si ya existe, no lo toques" pensado para sobrevivir a
 *  cerrar/reabrir el sheet, pero ningún call site vuelve a marcar la misma visita en
 *  curso — el único efecto real del guard era que, si quedaba una clave vieja de una
 *  visita anterior sin cerrar (p.ej. porque el backend de dev reusó un id tras un
 *  reset), el cronómetro de la visita NUEVA arrancaba contando desde ese timestamp
 *  viejo para siempre, mostrando horas o días que nunca pasaron. */
export function marcarInicioVisita(visitaId: number): void {
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
