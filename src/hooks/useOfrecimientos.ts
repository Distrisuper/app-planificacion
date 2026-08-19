import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    agregarOfrecimiento,
    eliminarOfrecimiento,
    getOfrecimientos,
    resolverOfrecimiento,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { errorCode } from '@/lib/apiError'
import type { IAccionComercial, IAgregarOfrecimientoDTO, IOfrecimientoMotivo } from '@/types/planificacion'

export const ofrecimientoKeys = {
    deVisita: (visitaId: number) => ['ofrecimientos', visitaId] as const,
}

export function useOfrecimientos(visitaId: number | null) {
    return useQuery({
        queryKey: ofrecimientoKeys.deVisita(visitaId ?? 0),
        queryFn: () => getOfrecimientos(visitaId as number),
        enabled: visitaId !== null,
    })
}

/**
 * Toda mutación de ofrecimientos invalida TAMBIÉN la agenda: `ofrecimientosPendientes` viaja en
 * la card del cliente, así que resolver un ofrecimiento cambia lo que la vista semanal muestra.
 */
function useMutacionDeOfrecimientos<TVars, TData>(
    visitaId: number,
    fn: (vars: TVars) => Promise<TData>,
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ofrecimientoKeys.deVisita(visitaId) })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export interface IResolverOfrecimientosItem {
    ofrecimientoId: number
    motivos: IOfrecimientoMotivo[]
    detalle?: IAccionComercial | null
}

export interface IResolverOfrecimientosResultado {
    ofrecimientoId: number
    /** null si guardó bien. */
    error: string | null
}

/**
 * Por qué falló el guardado de UN ofrecimiento, en palabras para el vendedor.
 *
 * Se ramifica por si hay `code` de negocio, no por status: un rechazo del servidor (400
 * MOTIVO_INEXISTENTE, MOTIVO_DETALLE_REQUERIDO…) no se arregla reintentando, y llamarlo
 * "Sin conexión" manda al vendedor a un loop de reintentos que nunca va a funcionar —
 * además de esconderle que el problema está en lo que cargó. Sin `code` sí es la red (o
 * algo que no devolvió body), y ahí reintentar es exactamente lo correcto.
 */
function porQueFallo(err: unknown): string {
    return errorCode(err) === null
        ? 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.'
        : 'El servidor rechazó la carga. Revisá lo que cargaste en este rubro.'
}

/** Guarda varios ofrecimientos en paralelo con Promise.allSettled: el fallo de uno no debe
 *  descartar los que sí llegaron a guardarse. El wizard usa `error` para reintentar
 *  solo los que fallaron, sin volver a mandar los que ya quedaron guardados. */
export function useResolverOfrecimientos(visitaId: number) {
    return useMutacionDeOfrecimientos(
        visitaId,
        async (items: IResolverOfrecimientosItem[]): Promise<IResolverOfrecimientosResultado[]> => {
            const resultados = await Promise.allSettled(
                items.map(item =>
                    resolverOfrecimiento(visitaId, item.ofrecimientoId, {
                        motivos: item.motivos,
                        ...(item.detalle !== undefined ? { detalle: item.detalle } : {}),
                    }),
                ),
            )
            return items.map((item, i) => {
                const r = resultados[i]
                return {
                    ofrecimientoId: item.ofrecimientoId,
                    error: r.status === 'rejected' ? porQueFallo(r.reason) : null,
                }
            })
        },
    )
}

export function useAgregarOfrecimiento(visitaId: number) {
    return useMutacionDeOfrecimientos(visitaId, (dto: IAgregarOfrecimientoDTO) =>
        agregarOfrecimiento(visitaId, dto),
    )
}

export function useEliminarOfrecimiento(visitaId: number) {
    return useMutacionDeOfrecimientos(visitaId, (ofrecimientoId: number) =>
        eliminarOfrecimiento(visitaId, ofrecimientoId),
    )
}
