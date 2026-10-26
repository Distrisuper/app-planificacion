import { errorCode } from './apiError'

/**
 * Semana del calendario (desde el 2/11/2026): todos los vendedores van en la misma semana de
 * la ruta, que avanza sola con el calendario. `GET /ciclo/actual` la manda como
 * `semanaEnCurso`; null = antes del ancla o back viejo, y ahí todo sigue como antes.
 * Ver docs/dominio/modelo.md, "El tiempo".
 */

export const MENSAJE_FUERA_DE_CALENDARIO = 'Este cliente es de otra semana. Podés traerlo a esta semana.'
export const MENSAJE_AGREGAR_FUERA_DE_CALENDARIO = 'Solo podés agregar clientes en la zona de esta semana.'
/** Para una visita ya abierta (quedó del viernes, se mira el lunes): no se puede traer
 *  —tiene resolución—, pero cerrarla no tiene guard en el back. */
export const MENSAJE_VISITA_FUERA_DE_CALENDARIO = 'Esta visita es de otra semana: solo se puede cerrar.'

/**
 * El texto del 409 `SEMANA_FUERA_DE_CALENDARIO` (el back rechaza una acción del vendedor
 * fuera de la semana en curso), o null si el error es otro. Va primero en cada `catch`:
 * sin esto el vendedor leía un "Volvé a intentar" que no iba a andar nunca.
 */
export function mensajeFueraDeCalendario(
    err: unknown,
    mensaje: string = MENSAJE_FUERA_DE_CALENDARIO,
): string | null {
    return errorCode(err) === 'SEMANA_FUERA_DE_CALENDARIO' ? mensaje : null
}

/**
 * Si el vendedor puede traer a la semana en curso una fila pendiente de `semana`. Solo de
 * las zonas que vienen: una semana sin trabajar se pierde, y sus pendientes los rescata
 * gerencia. Sin calendario (`semanaEnCurso` null) no cambia nada: se puede.
 */
export function sePuedeTraer(semana: number, semanaEnCurso: number | null): boolean {
    return semanaEnCurso === null || semana > semanaEnCurso
}
