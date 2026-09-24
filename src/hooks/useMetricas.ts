import { useQuery, type QueryKey } from '@tanstack/react-query'
import {
    getCategoriasMetricas, getClientesDeTramo, getObjecionDetalle, getObjecionesMetricas,
    getOpcionesMetricas, getResumenMetricas, type IArgsListado,
} from '@/api/metricas'
import type { IFiltroMetricas, Tramo } from '@/types/metricas'

const clave = (f: IFiltroMetricas) =>
    [f.desde, f.hasta, f.vendedor ?? '', f.sucursal ?? '', f.zona ?? '', f.localidad ?? ''] as const

/** Identidad del recorte (período + filtros). Los bloques la usan para soltar lo que
 *  tenían abierto cuando el recorte cambia. */
export const claveDelFiltro = (f: IFiltroMetricas): string => clave(f).join('|')

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

/** Las claves de los listados terminan en `pagina, orden, dir`. Dos claves que solo difieren
 *  en eso son la MISMA lista en otra página u otro orden. */
const ARGS_DE_LISTADO = 3
const mismaLista = (a: QueryKey, b: QueryKey) =>
    a.length === b.length && a.slice(0, -ARGS_DE_LISTADO).every((v, i) => v === b[i])

/** `keepPreviousData`, pero solo dentro de la misma lista: al cambiar de página no se vacía
 *  la tabla mientras llega la siguiente. Al abrir OTRA objeción (u otro tramo, u otro filtro),
 *  mostrar la anterior sería mostrar clientes que no son, con el título equivocado arriba. */
function mantenerSiEsLaMismaLista<T>(clave: QueryKey) {
    return (previo: T | undefined, query: { queryKey: QueryKey } | undefined) =>
        query && mismaLista(query.queryKey, clave) ? previo : undefined
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
        placeholderData: mantenerSiEsLaMismaLista(metricasKeys.detalle(f, motivoId ?? 0, a)),
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
        placeholderData: mantenerSiEsLaMismaLista(metricasKeys.tramo(f, tramo ?? 'sinCompras', a)),
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
