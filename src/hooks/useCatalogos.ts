import { useQuery } from '@tanstack/react-query'
import { getBrandCatalog } from '@/api/planificacion'

export const catalogoKeys = {
    marcas: ['catalogo', 'marcas'] as const,
}

/** Es un catálogo: se recalcula sobre 12 meses de ventas. Del lado del server ya
 *  viene cacheado en Redis, así que refetchear cada 5 minutos (el default de
 *  queryClient) sería puro ruido. */
const CATALOGO_STALE_MS = 30 * 60 * 1000

export function useBrandCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.marcas,
        queryFn: getBrandCatalog,
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}
