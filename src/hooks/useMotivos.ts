import { useQuery } from '@tanstack/react-query'
import { getMotivos } from '@/api/planificacion'
import type { NivelMotivo } from '@/types/planificacion'

/** El catálogo es DATO (agregar un motivo es un INSERT), así que nunca se hardcodea
 *  del lado del front. `nivel` separa el picklist de "no visité" del de rubros. */
export function useMotivos(nivel?: NivelMotivo) {
    return useQuery({
        queryKey: ['motivos', nivel ?? 'todos'],
        queryFn: () => getMotivos(nivel),
        staleTime: 30 * 60 * 1000,
    })
}
