import { useQuery } from '@tanstack/react-query'
import { getBrandCatalog } from '@/api/planificacion'

export const catalogoKeys = {
    marcas: ['catalogo', 'marcas'] as const,
}

/** Es un catálogo: se recalcula sobre 12 meses de ventas. Del lado del server ya
 *  viene cacheado en Redis, así que refetchear cada 5 minutos (el default de
 *  queryClient) sería puro ruido. */
const CATALOGO_STALE_MS = 30 * 60 * 1000

/**
 * `fct_sales.brand_name` no es solo marcas: trae códigos administrativos del ERP que
 * comparten la misma dimensión (ACC, 120, 108, 121) — "vendieron" bajo esos códigos por
 * cómo se cargan ciertos movimientos, pero no son una marca que el vendedor pueda elegir
 * en MarcaOfrecimientoPicker.
 *
 * Excluidos acá, del lado del front, a propósito: es un parche rápido mientras el
 * warehouse no tiene de dónde distinguir "marca real" de "código administrativo" sin
 * hardcodear nombres — si se filtrara en el backend (BrandCatalogService), cualquier otro
 * consumidor futuro del catálogo heredaría el mismo hardcodeo sin necesitarlo.
 */
const MARCAS_EXCLUIDAS = new Set([
    'ACCION COMERCIAL',
    'FEE POR SUSCRIPCION',
    'OP UNICA',
    'OPERACION ESPECIAL',
])

export function useBrandCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.marcas,
        queryFn: getBrandCatalog,
        select: marcas => marcas.filter(m => !MARCAS_EXCLUIDAS.has(m.description)),
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}
