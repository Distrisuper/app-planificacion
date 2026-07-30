import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    agregarRubro,
    eliminarRubro,
    getRubros,
    resolverRubro,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IAgregarRubroDTO, IRubroMotivo } from '@/types/planificacion'

export const rubroKeys = {
    deVisita: (visitaId: number) => ['rubros', visitaId] as const,
}

export function useRubros(visitaId: number | null) {
    return useQuery({
        queryKey: rubroKeys.deVisita(visitaId ?? 0),
        queryFn: () => getRubros(visitaId as number),
        enabled: visitaId !== null,
    })
}

/**
 * Toda mutación de rubros invalida TAMBIÉN la agenda: `rubrosPendientes` viaja en la
 * card del cliente, así que resolver un rubro cambia lo que la vista semanal muestra.
 */
function useMutacionDeRubros<TVars, TData>(
    visitaId: number,
    fn: (vars: TVars) => Promise<TData>,
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rubroKeys.deVisita(visitaId) })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export interface IResolverRubrosItem {
    rubroId: number
    motivos: IRubroMotivo[]
}

export interface IResolverRubrosResultado {
    rubroId: number
    /** null si guardó bien. */
    error: string | null
}

/** Guarda varios rubros en paralelo con Promise.allSettled: el fallo de uno no debe
 *  descartar los que sí llegaron a guardarse. El wizard usa `error` para reintentar
 *  solo los que fallaron, sin volver a mandar los que ya quedaron guardados. */
export function useResolverRubros(visitaId: number) {
    return useMutacionDeRubros(
        visitaId,
        async (items: IResolverRubrosItem[]): Promise<IResolverRubrosResultado[]> => {
            const resultados = await Promise.allSettled(
                items.map(item => resolverRubro(visitaId, item.rubroId, { motivos: item.motivos })),
            )
            return items.map((item, i) => ({
                rubroId: item.rubroId,
                error:
                    resultados[i].status === 'rejected'
                        ? 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.'
                        : null,
            }))
        },
    )
}

export function useAgregarRubro(visitaId: number) {
    return useMutacionDeRubros(visitaId, (dto: IAgregarRubroDTO) =>
        agregarRubro(visitaId, dto),
    )
}

export function useEliminarRubro(visitaId: number) {
    return useMutacionDeRubros(visitaId, (rubroId: number) =>
        eliminarRubro(visitaId, rubroId),
    )
}
