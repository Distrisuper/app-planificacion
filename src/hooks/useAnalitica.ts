import { useQuery } from '@tanstack/react-query'
import {
    getObjeciones,
    getResumen,
    getVendedores,
    getVisitaDetalle,
    getVisitas,
    type IObjecionesArgs,
    type IVisitasArgs,
} from '@/api/analitica'
import type { IAnaliticaFiltro } from '@/types/analitica'

export const analiticaKeys = {
    resumen: (f: IAnaliticaFiltro) =>
        ['analitica', 'resumen', f.desde, f.hasta, (f.vendedores ?? []).join(',')] as const,
    visitas: (a: IVisitasArgs) =>
        [
            'analitica',
            'visitas',
            a.vendedor ?? '',
            // El multi-select de la vista de actividad viaja por acá: sin incluirlo,
            // dos filtros distintos compartirían entrada de caché y la tabla mostraría
            // las filas del filtro anterior.
            (a.vendedores ?? []).join(','),
            a.desde,
            a.hasta,
            a.cliente ?? '',
            (a.tipo ?? []).join(','),
        ] as const,
    detalle: (id: number) => ['analitica', 'visita', id] as const,
    objeciones: (a: IObjecionesArgs) =>
        ['analitica', 'objeciones', a.desde, a.hasta, a.zona ?? '', a.rubro ?? ''] as const,
    vendedores: () => ['analitica', 'vendedores'] as const,
}

export function useResumen(filtro: IAnaliticaFiltro) {
    return useQuery({
        queryKey: analiticaKeys.resumen(filtro),
        queryFn: () => getResumen(filtro),
    })
}

interface OpcionesVisitas {
    /** Milisegundos entre refrescos. 0 o ausente = sin auto-refresh. */
    refrescarCada?: number
}

/** Sin `vendedor` devuelve al equipo completo: es la vista de actividad. */
export function useVisitas(args: IVisitasArgs, opciones: OpcionesVisitas = {}) {
    const refrescarCada = opciones.refrescarCada ?? 0
    return useQuery({
        queryKey: analiticaKeys.visitas(args),
        queryFn: () => getVisitas(args),
        refetchInterval: refrescarCada > 0 ? refrescarCada : false,
        // El staleTime global es de 5 min: sin bajarlo acá, el intervalo refrescaría
        // contra caché y la pantalla se quedaría quieta igual.
        staleTime: refrescarCada > 0 ? 0 : undefined,
    })
}

export function useVisitaDetalle(visitaId: number | null) {
    return useQuery({
        queryKey: analiticaKeys.detalle(visitaId ?? 0),
        queryFn: () => getVisitaDetalle(visitaId as number),
        enabled: visitaId !== null,
    })
}

export function useObjeciones(args: IObjecionesArgs) {
    return useQuery({
        queryKey: analiticaKeys.objeciones(args),
        queryFn: () => getObjeciones(args),
    })
}

/** El roster cambia de mes a mes, no de minuto a minuto: no hace falta refrescarlo
 *  con cada cambio de rango, por eso no depende del filtro. */
export function useVendedores() {
    return useQuery({
        queryKey: analiticaKeys.vendedores(),
        queryFn: getVendedores,
        staleTime: 30 * 60 * 1000,
    })
}
