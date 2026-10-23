import { useQuery } from '@tanstack/react-query'
import { getCupoCliente } from '@/api/planificacion'

export const cupoKeys = {
    todo: ['planificacion', 'cupo'] as const,
    cliente: (codigo: string) => ['planificacion', 'cupo', codigo] as const,
}

/**
 * Plan CUPO del cliente en el mes en curso. `codigo` null = no se pide (cliente nuevo, o
 * no hay visita a la vista). Sin reintentos: un 403 FUERA_DE_ALCANCE o un back sin el
 * endpoint no se arreglan solos, y el recuadro no se muestra mientras carga o si falla.
 */
export function useCupoCliente(codigo: string | null) {
    return useQuery({
        queryKey: cupoKeys.cliente(codigo ?? ''),
        queryFn: () => getCupoCliente(codigo!),
        enabled: !!codigo,
        retry: false,
    })
}
