import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getMisMetricas } from '@/api/misMetricas'

export const misMetricasKeys = {
    rango: (desde: string, hasta: string) => ['mis-metricas', desde, hasta] as const,
}

export function useMisMetricas(desde: string, hasta: string) {
    return useQuery({
        queryKey: misMetricasKeys.rango(desde, hasta),
        queryFn: () => getMisMetricas(desde, hasta),
        // Al cambiar de mes se sigue mostrando el anterior mientras carga, en vez de
        // colapsar la pantalla a un spinner entre ‹ y ›.
        placeholderData: keepPreviousData,
    })
}
