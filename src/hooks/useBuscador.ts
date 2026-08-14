import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buscarEnCartera, confirmarExtra, consultarBuscador } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'

/** Solo lectura: consulta si el cliente ya tiene fila pendiente en la zona en curso o
 *  en otra zona. No invalida nada — no escribe. */
export function useConsultarBuscador() {
    return useMutation({
        mutationFn: ({ codigo, semana }: { codigo: string; semana: number }) =>
            consultarBuscador(codigo, semana),
    })
}

/** Crea la fila `es_extra`. Invalida agenda/preview/ciclo igual que `useReacomodar`
 *  (`useCiclo.ts`): la fila nueva puede cambiar tanto la agenda del día como el preview
 *  de la zona en curso. */
export function useConfirmarExtra() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ codigo, semana }: { codigo: string; semana: number }) =>
            confirmarExtra(codigo, semana),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

/** Buscador general de solo lectura. Se activa recién con 2+ caracteres para no pegarle
 *  a la API en cada tecla de un texto vacío. */
export function useBuscarEnCartera(texto: string) {
    return useQuery({
        queryKey: ['buscador', 'rotacion', texto],
        queryFn: () => buscarEnCartera(texto),
        enabled: texto.trim().length >= 2,
    })
}
