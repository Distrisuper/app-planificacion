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

/** El PUT REEMPLAZA los motivos del rubro, no acumula. */
export function useResolverRubro(visitaId: number) {
    return useMutacionDeRubros(
        visitaId,
        (args: { rubroId: number; motivos: IRubroMotivo[] }) =>
            resolverRubro(visitaId, args.rubroId, { motivos: args.motivos }),
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
