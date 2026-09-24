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

/**
 * El cliente de la visita en curso con la coordenada que el SERVIDOR persistió al iniciar
 * (`pl_resolucion.coord_cliente`: la reposicionada si el vendedor movió el pin, la del
 * warehouse si no, la marcada en el mapa si es un alta).
 *
 * La reposición vivía solo en este puntero local, y el puntero no sobrevive a cerrar
 * sesión, a un 401 ni a otro dispositivo: al perderlo, la visita se re-adoptaba desde la
 * card de la agenda, que trae la coordenada del warehouse (la corrección permanente a
 * client-service tarda un día en volver), y el aviso de "te alejaste" medía contra el
 * pin viejo — "estás a 371 km" parado donde se reposicionó.
 *
 * Devuelve la MISMA referencia si no hay nada que corregir: el resultado alimenta
 * efectos y un objeto nuevo en cada render los dispararía en loop.
 */
export function conCoordClienteDelServidor<T extends IVisitaEnCursoGuardada>(
    visita: T | null,
    activa: { id: number; coordCliente: string | null } | null | undefined,
): T | null {
    if (!visita || !activa || activa.id !== visita.visitaId || !activa.coordCliente) return visita
    const [lat, lng] = activa.coordCliente.split(',').map(Number)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return visita
    if (visita.cliente.latitud === lat && visita.cliente.longitud === lng) return visita
    return { ...visita, cliente: { ...visita.cliente, latitud: lat, longitud: lng } }
}
