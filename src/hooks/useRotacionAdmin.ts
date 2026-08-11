import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cancelarRotacion,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    reacomodarAdmin,
    reordenarRotacion,
} from '@/api/planificacionAdmin'
import type { IReacomodarDTO } from '@/types/planificacion'

export const rotacionAdminKeys = {
    /** Toda la data de gerencia de un vendedor, para invalidar de una. */
    vendedor: (codigo: string) => ['rotacionAdmin', codigo] as const,
    cola: (codigo: string) => ['rotacionAdmin', codigo, 'cola'] as const,
    grid: (codigo: string, rotacionId: number) =>
        ['rotacionAdmin', codigo, 'grid', rotacionId] as const,
}

/** `codigo` null = todavía no se eligió vendedor: no se consulta nada. */
export function useRotaciones(codigo: string | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.cola(codigo ?? ''),
        queryFn: () => getRotaciones(codigo as string),
        enabled: codigo !== null,
    })
}

export function useRotacion(codigo: string | null, rotacionId: number | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.grid(codigo ?? '', rotacionId ?? 0),
        queryFn: () => getRotacion(codigo as string, rotacionId as number),
        enabled: codigo !== null && rotacionId !== null,
    })
}

/** Encola una programada nueva. Invalida la cola: hay un chip más. */
export function useCrearRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => crearRotacion(codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/**
 * Mover una card. Invalida solo el grid de ESA rotación: la cola no cambió y los grids de
 * las otras rotaciones tampoco — un reacomodo nunca cruza rotaciones.
 */
export function useReacomodarAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (
            args: { rotacionId: number; rotacionClienteId: number } & IReacomodarDTO,
        ) =>
            reacomodarAdmin(codigo, args.rotacionId, args.rotacionClienteId, {
                semana: args.semana,
                dia: args.dia,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}

export function useReordenarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; orden: number }) =>
            reordenarRotacion(codigo, args.rotacionId, args.orden),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

export function useCancelarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rotacionId: number) => cancelarRotacion(codigo, rotacionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/** El nombre de la rotación se ve en el chip (cola) y en el grid: invalida los dos. */
export function useEditarDescripcionRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; descripcion: string | null }) =>
            editarDescripcionRotacion(codigo, args.rotacionId, args.descripcion),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.vendedor(codigo) })
        },
    })
}

export function useEditarDescripcionSemana(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            rotacionId: number
            semana: number
            descripcion: string | null
        }) => editarDescripcionSemana(codigo, args.rotacionId, args.semana, args.descripcion),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
