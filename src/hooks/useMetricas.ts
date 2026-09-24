import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
    getCategoriasMetricas, getClientesDeTramo, getObjecionDetalle, getObjecionesMetricas,
    getOpcionesMetricas, getResumenMetricas, type IArgsListado,
} from '@/api/metricas'
import type { IFiltroMetricas, Tramo } from '@/types/metricas'

const clave = (f: IFiltroMetricas) =>
    [f.desde, f.hasta, f.vendedor ?? '', f.sucursal ?? '', f.zona ?? '', f.localidad ?? ''] as const

export const metricasKeys = {
    resumen: (f: IFiltroMetricas) => ['metricas', 'resumen', ...clave(f)] as const,
    objeciones: (f: IFiltroMetricas, rubro?: string) => ['metricas', 'objeciones', ...clave(f), rubro ?? ''] as const,
    detalle: (f: IFiltroMetricas, motivoId: number, a: IArgsListado & { rubro?: string }) =>
        ['metricas', 'objecion', ...clave(f), motivoId, a.rubro ?? '', a.pagina, a.orden, a.dir] as const,
    categorias: (f: IFiltroMetricas) => ['metricas', 'categorias', ...clave(f)] as const,
    tramo: (f: IFiltroMetricas, tramo: Tramo, a: IArgsListado) =>
        ['metricas', 'tramo', ...clave(f), tramo, a.pagina, a.orden, a.dir] as const,
    opciones: (hasta: string) => ['metricas', 'opciones', hasta.slice(0, 7)] as const,
}

export function useResumenMetricas(f: IFiltroMetricas) {
    return useQuery({ queryKey: metricasKeys.resumen(f), queryFn: () => getResumenMetricas(f) })
}

export function useObjecionesMetricas(f: IFiltroMetricas, rubro?: string) {
    return useQuery({ queryKey: metricasKeys.objeciones(f, rubro), queryFn: () => getObjecionesMetricas(f, rubro) })
}

/** Solo se pide al tocar una tarjeta: `motivoId` null = nada abierto. */
export function useObjecionDetalle(f: IFiltroMetricas, motivoId: number | null, a: IArgsListado & { rubro?: string }) {
    return useQuery({
        queryKey: metricasKeys.detalle(f, motivoId ?? 0, a),
        queryFn: () => getObjecionDetalle(f, motivoId as number, a),
        enabled: motivoId !== null,
        // Cambiar de página no debe vaciar la tabla mientras llega la siguiente.
        placeholderData: keepPreviousData,
    })
}

export function useCategoriasMetricas(f: IFiltroMetricas) {
    return useQuery({ queryKey: metricasKeys.categorias(f), queryFn: () => getCategoriasMetricas(f) })
}

export function useClientesDeTramo(f: IFiltroMetricas, tramo: Tramo | null, a: IArgsListado) {
    return useQuery({
        queryKey: metricasKeys.tramo(f, tramo ?? 'sinCompras', a),
        queryFn: () => getClientesDeTramo(f, tramo as Tramo, a),
        enabled: tramo !== null,
        placeholderData: keepPreviousData,
    })
}

/** Las opciones de zona/localidad cambian con la cartera, no con el día: una por mes. */
export function useOpcionesMetricas(hasta: string) {
    return useQuery({
        queryKey: metricasKeys.opciones(hasta),
        queryFn: () => getOpcionesMetricas(hasta),
        staleTime: 30 * 60 * 1000,
    })
}
