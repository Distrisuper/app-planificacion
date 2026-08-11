import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cancelarRotacion,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    intercambiarDias,
    reacomodarAdmin,
    reordenarRotacion,
} from '@/api/planificacionAdmin'
import { moverEnGrid } from '@/lib/moverEnGrid'
import type {
    IIntercambiarDiasDTO,
    IReacomodarDTO,
    IRotacionCompleta,
} from '@/types/planificacion'

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
        /**
         * Update optimista: la card se mueve en la caché antes de que el backend conteste,
         * así el arrastre se siente instantáneo. Sin esto había que esperar el PATCH más la
         * relectura del grid entero para ver la card en su lugar nuevo.
         */
        onMutate: async args => {
            const key = rotacionAdminKeys.grid(codigo, args.rotacionId)
            // Cancelar lo que esté en vuelo: si una relectura anterior llega después de
            // escribir la caché, la pisa con el estado viejo y la card "vuelve" sola.
            await qc.cancelQueries({ queryKey: key })

            const previo = qc.getQueryData<IRotacionCompleta>(key)
            if (previo) {
                qc.setQueryData(
                    key,
                    moverEnGrid(previo, args.rotacionClienteId, args.semana, args.dia),
                )
            }
            return { previo, key }
        },
        onError: (_err, _args, context) => {
            // Rollback. Importa de verdad: el backend rechaza mover un cliente ya resuelto
            // (409 FILA_RESUELTA) y una semana fuera del set (422), y sin esto la card
            // quedaba visualmente en un lugar donde no está.
            if (context?.previo) qc.setQueryData(context.key, context.previo)
        },
        onSettled: (_data, _err, args) => {
            // Reconciliar igual, en éxito y en error: la autoría (`ultimoMovimiento`: quién
            // movió y cuándo) la calcula el backend y no se puede adivinar acá. Con la card
            // recortada el grid pesa ~30 KB, así que este refetch es barato — antes eran
            // 1.46 MB por movimiento.
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

/**
 * Sin update optimista, a diferencia del arrastre de una card: acá se mueven hasta ~20
 * filas de golpe y el rechazo por clientes resueltos es un caso esperado, no un borde. Con
 * el grid recortado a ~31 KB, esperar la confirmación y releer es más simple y no se nota.
 */
export function useIntercambiarDias(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number } & IIntercambiarDiasDTO) =>
            intercambiarDias(codigo, args.rotacionId, {
                semanaA: args.semanaA,
                diaA: args.diaA,
                semanaB: args.semanaB,
                diaB: args.diaB,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
