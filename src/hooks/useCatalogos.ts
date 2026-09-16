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

/**
 * `fct_sales.brand_name` no es solo marcas: trae códigos administrativos del ERP que
 * comparten la misma dimensión (ACC, 120, 108, 121, -1) — "vendieron" bajo esos códigos
 * por cómo se cargan ciertos movimientos, pero no son una marca que el vendedor pueda
 * elegir en MarcasOfrecidasChips. `Z OPERACION ESPECIAL` (code -1) es la misma
 * categoría que `OPERACION ESPECIAL` (108) con otro code — el prefijo "Z" y el code -1
 * son la marca típica de un valor placeholder/de cola en este ERP.
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
    'Z OPERACION ESPECIAL',
])

/** Catálogo de rubros válidos: de dónde salen las filas agregables de la visita y los
 *  resultados de rubro del buscador de "Agregar ofrecimiento". `enabled` existe para no
 *  pagarlo donde no se usa (visita cerrada, propuesta previa): son vendedores en la calle
 *  con datos móviles. */
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
        select: marcas => marcas.filter(m => !MARCAS_EXCLUIDAS.has(m.description)),
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}
