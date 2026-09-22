import { useQuery } from '@tanstack/react-query'
import { getFichas } from '@/api/analitica'
import type { IFichasArgs } from '@/types/analitica'

export const fichasKeys = {
    lista: (args: IFichasArgs) => ['analitica', 'fichas', args] as const,
}

/**
 * "Datos del comercio" cargados, para gerencia.
 *
 * Sin `desde`/`hasta` el endpoint devuelve TODO lo acumulado: la ficha se llena una vez por
 * cliente y nunca más, así que el default de las otras tabs (la semana en curso) mostraría
 * cuatro filas. El rango queda disponible para preguntar "qué entró esta semana".
 */
export function useFichasRelevadas(args: IFichasArgs) {
    return useQuery({
        queryKey: fichasKeys.lista(args),
        queryFn: () => getFichas(args),
    })
}
