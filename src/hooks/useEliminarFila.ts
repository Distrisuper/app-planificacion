import { useMutation, useQueryClient } from '@tanstack/react-query'
import { eliminarFilaPropia } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'

/**
 * "Sacar de mi agenda" (spec 2026-09-21): saca una fila que el vendedor agregó a mano.
 *
 * `onSettled` y no `onSuccess`: los 409 que puede devolver esta ruta —la fila ya se
 * resolvió, o hay una visita abierta— significan que la card que el vendedor está
 * mirando quedó vieja, así que refrescar la agenda es parte de la respuesta al error,
 * no solo al éxito.
 */
export function useEliminarFila() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rotacionClienteId: number) => eliminarFilaPropia(rotacionClienteId),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}
