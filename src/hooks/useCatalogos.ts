import { useQuery } from '@tanstack/react-query'
import { getBrandCatalog, getRubroCatalog } from '@/api/planificacion'

export const catalogoKeys = {
    rubros: ['catalogo', 'rubros'] as const,
    marcas: ['catalogo', 'marcas'] as const,
}

/** Son catálogos: el de rubros cambia de mes a mes y el de marcas se recalcula sobre
 *  12 meses de ventas. Del lado del server ya vienen cacheados en Redis, así que
 *  refetchear cada 5 minutos (el default de queryClient) sería puro ruido. */
const CATALOGO_STALE_MS = 30 * 60 * 1000

/** `enabled` existe para pedirlo recién cuando se abre el buscador: son vendedores
 *  en la calle con datos móviles. */
export function useRubroCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.rubros,
        queryFn: getRubroCatalog,
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}

export function useBrandCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.marcas,
        queryFn: getBrandCatalog,
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}
