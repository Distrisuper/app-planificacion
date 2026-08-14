import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buscarEnCartera, confirmarExtra, consultarBuscador } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'

const DEBOUNCE_MS = 300

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
        mutationFn: ({ codigo, semana, dia }: { codigo: string; semana: number; dia?: number }) =>
            confirmarExtra(codigo, semana, dia),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['ciclo', 'preview'] })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

/**
 * Busca sobre TODA la cartera del vendedor (no solo el plan de la vuelta), que es lo
 * que hace falta para el caso central: el cliente que llamó y no está en la hoja de
 * ruta. Lo usan los dos buscadores — el general del header y el del "+" de cada día.
 *
 * Se activa recién con 2+ caracteres y con 300ms de debounce: el endpoint resuelve el
 * estado cliente por cliente (una query cada uno, ver `BuscadorService.buscarEnCartera`),
 * así que una request por tecla sobre una cartera grande es cara de verdad.
 */
export function useBuscarEnCartera(texto: string) {
    const [debounced, setDebounced] = useState(texto)
    useEffect(() => {
        const id = setTimeout(() => setDebounced(texto), DEBOUNCE_MS)
        return () => clearTimeout(id)
    }, [texto])

    const listo = debounced.trim().length >= 2
    const query = useQuery({
        queryKey: ['buscador', 'rotacion', debounced],
        queryFn: () => buscarEnCartera(debounced),
        enabled: listo,
    })

    return {
        ...query,
        // Mientras el debounce todavía no alcanzó al input, lo que hay en pantalla son
        // los resultados del texto ANTERIOR. Sin esto, tipear una letra más deja ver
        // por 300ms una lista que ya no corresponde a lo que dice el input, y el
        // "Sin resultados" aparece antes de haber buscado.
        buscando: query.isFetching || (listo && debounced !== texto),
    }
}
