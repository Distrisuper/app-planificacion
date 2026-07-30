import { useQuery } from '@tanstack/react-query'
import {
    getObjeciones,
    getResumen,
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
        ['analitica', 'visitas', a.vendedor, a.desde, a.hasta, a.cliente ?? ''] as const,
    detalle: (id: number) => ['analitica', 'visita', id] as const,
    objeciones: (a: IObjecionesArgs) =>
        ['analitica', 'objeciones', a.desde, a.hasta, a.zona ?? '', a.rubro ?? ''] as const,
}

export function useResumen(filtro: IAnaliticaFiltro) {
    return useQuery({
        queryKey: analiticaKeys.resumen(filtro),
        queryFn: () => getResumen(filtro),
    })
}

/** Sin vendedor no hay nada que pedir: el nivel 2 se monta recién al elegir uno. */
export function useVisitas(args: IVisitasArgs) {
    return useQuery({
        queryKey: analiticaKeys.visitas(args),
        queryFn: () => getVisitas(args),
        enabled: Boolean(args.vendedor),
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
