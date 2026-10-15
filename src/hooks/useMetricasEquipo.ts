import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
    getObjecionesPorPersona,
    getProductividadTv,
    getRubrosCatalogo,
    getVentasVendedores,
    type IObjecionesPorPersonaArgs,
} from '@/api/metricasEquipo'

export const metricasEquipoKeys = {
    productividadTv: (desde: string, hasta: string) => ['metricas-equipo', 'productividad-tv', desde, hasta] as const,
    objeciones: (a: IObjecionesPorPersonaArgs) =>
        ['metricas-equipo', 'objeciones', a.desde, a.hasta, a.rubro ?? ''] as const,
    ventas: () => ['metricas-equipo', 'ventas'] as const,
    rubros: () => ['metricas-equipo', 'rubros'] as const,
}

export function useProductividadTv(desde: string, hasta: string) {
    return useQuery({
        queryKey: metricasEquipoKeys.productividadTv(desde, hasta),
        queryFn: () => getProductividadTv({ desde, hasta }),
        placeholderData: keepPreviousData,
    })
}

/** Cambiar de rubro no vacía la tarjeta: muestra la anterior atenuada hasta que llega la nueva. */
export function useObjecionesPorPersona(args: IObjecionesPorPersonaArgs) {
    return useQuery({
        queryKey: metricasEquipoKeys.objeciones(args),
        queryFn: () => getObjecionesPorPersona(args),
        placeholderData: keepPreviousData,
    })
}

/** Las ventas del warehouse cambian cuando corre dbt, no de minuto a minuto. */
export function useVentasVendedores() {
    return useQuery({
        queryKey: metricasEquipoKeys.ventas(),
        queryFn: getVentasVendedores,
        staleTime: 15 * 60 * 1000,
    })
}

export function useRubrosCatalogo() {
    return useQuery({
        queryKey: metricasEquipoKeys.rubros(),
        queryFn: getRubrosCatalogo,
        staleTime: Infinity,
    })
}
