import { useMutation, useQueryClient } from '@tanstack/react-query'
import { crearAlta, editarAlta, reintentarAlta } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { ICrearAltaDTO, IEditarAltaDTO } from '@/types/planificacion'

/** Mismo `onSuccess` que `useConfirmarExtra` (`useBuscador.ts`): una fila de alta puede
 *  cambiar tanto la agenda del día como el preview de la zona en curso. */
function useMutacionDeAlta<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

/** "Cliente nuevo": crea la fila de alta en (zona vista, dia). */
export function useCrearAlta() {
    return useMutacionDeAlta((dto: ICrearAltaDTO) => crearAlta(dto))
}

export function useEditarAlta() {
    return useMutacionDeAlta((args: { rotacionClienteId: number; dto: IEditarAltaDTO }) =>
        editarAlta(args.rotacionClienteId, args.dto),
    )
}

/** Después de un "No visité": otra fila para el mismo comercio, en `dia`. */
export function useReintentarAlta() {
    return useMutacionDeAlta((args: { rotacionClienteId: number; dia: number }) =>
        reintentarAlta(args.rotacionClienteId, args.dia),
    )
}
