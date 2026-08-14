import { useQuery } from '@tanstack/react-query'
import { getAcciones } from '@/api/planificacion'

export const accionesKeys = {
    catalogo: ['acciones'] as const,
}

/** Catálogo de acciones comerciales. Cambia por INSERT en el back, no por deploy, así
 *  que se cachea largo igual que el de motivos. */
export function useAcciones() {
    return useQuery({
        queryKey: accionesKeys.catalogo,
        queryFn: getAcciones,
        staleTime: 30 * 60 * 1000,
    })
}
