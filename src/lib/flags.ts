/**
 * Interruptores temporales de features ya implementadas (front + back) que todavía
 * no se quieren habilitar al vendedor. Son constantes, no config remota: apagar
 * algo es un deploy, no un panel.
 */

/**
 * "Cliente nuevo" (visita de alta, spec 2026-09-17). El backend ya está en
 * producción y el flujo completo existe; se apaga sólo el punto de entrada
 * —el botón del buscador del día— para poder seguir con otras features sin
 * que nadie empiece a cargar altas todavía.
 *
 * Poner en `true` para habilitarlo: no hay nada más que tocar. Las filas con
 * `tipo='alta'` que ya existieran se siguen viendo y operando normalmente
 * (editar datos, volver a agendar, visitar) — apagar la creación no puede
 * esconder un plan ya materializado.
 */
export const ALTAS_HABILITADAS = false
