import type { TipoFilaPlan } from '@/types/planificacion'

/** "Cliente nuevo" (spec 2026-09-17). Ausente = cliente real: los payloads viejos y los
 *  fixtures de test no traen `tipo`. */
export function esAlta(c: { tipo?: TipoFilaPlan } | null | undefined): boolean {
    return c?.tipo === 'alta'
}

/** Gate de cierre de una visita de alta. No hay propuesta congelada, así que el
 *  `min(2, ofrecidos)` de los clientes reales se auto-satisface en 0; acá se pide que
 *  haya quedado ALGO: un ofrecimiento completo o una observación. */
export function puedeCerrarAlta(completos: number, observaciones: string): boolean {
    return completos >= 1 || observaciones.trim() !== ''
}
