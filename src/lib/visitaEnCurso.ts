import type { IAgendaClient } from '@/types/planificacion'

const KEY = 'visita-en-curso'

/** Misma forma que VisitaFlow.IVisitaEnCurso — no se importa desde acá para no hacer que
 *  un lib dependa de un componente; son la misma forma por convención, no por acoplamiento. */
export interface IVisitaEnCursoGuardada {
    cliente: IAgendaClient
    visitaId: number
}

/**
 * Ancla local de "hay una visita abierta ahora mismo", para sobrevivir a recargar la app
 * sin señal.
 *
 * Sin esto, `visitaEnCurso` en AgendaSemanaPage es puro `useState`: se restaura leyendo la
 * agenda del servidor, y si esa query falla (sin conexión) la app le muestra al vendedor que
 * no tiene ninguna visita abierta, cuando en el backend sigue estándolo. Es singleton — hay
 * una sola visita abierta a la vez, la app ya lo asume (`bloqueadoPorOtraVisita`) — así que a
 * diferencia de `visitaTimer`/`resolucionDraft` no lleva el id en la clave.
 *
 * Cuando la agenda del servidor llega, gana ella: esto es solo el puente hasta que eso pase.
 */
export function guardarVisitaEnCurso(visita: IVisitaEnCursoGuardada): void {
    localStorage.setItem(KEY, JSON.stringify(visita))
}

/** null si no hay nada guardado, o si lo que hay no es JSON válido. */
export function leerVisitaEnCurso(): IVisitaEnCursoGuardada | null {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return null
    try {
        return JSON.parse(raw) as IVisitaEnCursoGuardada
    } catch {
        return null
    }
}

export function limpiarVisitaEnCurso(): void {
    localStorage.removeItem(KEY)
}
