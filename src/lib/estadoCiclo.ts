import type { EstadoCicloCliente } from '@/types/planificacion'

/**
 * Si el cliente ya está resuelto en la vuelta.
 *
 * 'en_curso' NO cuenta: la visita está abierta y la semana no puede cerrar con eso.
 *
 * El backend contesta esta misma pregunta en SQL (CicloClienteRepository
 * .findCodigosSinResolver) para no traer las ~40 filas al cerrar el ciclo. Acá vive
 * igual porque los contadores de DiaTabs y el progreso del header la necesitan sobre
 * datos que ya están en memoria.
 */
export function estaResuelto(estado: EstadoCicloCliente): boolean {
    return estado === 'visitada' || estado === 'no_visita'
}
