/**
 * Interruptores temporales de features ya implementadas (front + back) que todavía
 * no se quieren habilitar al vendedor. Son constantes, no config remota: apagar
 * algo es un deploy, no un panel.
 */

/**
 * "Cliente nuevo" (visita de alta, spec 2026-09-17). Habilitado desde el PR
 * del relevamiento del alta. El interruptor controla sólo el punto de entrada
 * —el botón del buscador del día—.
 *
 * Poner en `false` para volver a apagarlo: no hay nada más que tocar. Las filas con
 * `tipo='alta'` que ya existieran se siguen viendo y operando normalmente
 * (editar datos, volver a agendar, visitar) — apagar la creación no puede
 * esconder un plan ya materializado.
 */
export const ALTAS_HABILITADAS = true
