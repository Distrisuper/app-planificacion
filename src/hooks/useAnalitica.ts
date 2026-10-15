import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    getAltas,
    getContactos,
    getCriterioVisita,
    getLlamadoDetalle,
    getObjeciones,
    getResumen,
    getTelevendedores,
    getVendedores,
    getVisitaDetalle,
    getVisitas,
    vincularAlta,
    type IContactosArgs,
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
            a.validez ?? '',
        ] as const,
    contactos: (a: IContactosArgs) =>
        [
            'analitica',
            'contactos',
            a.vendedor ?? '',
            (a.vendedores ?? []).join(','),
            a.desde,
            a.hasta,
            a.cliente ?? '',
            // El canal es un filtro más: sin él en la clave, "Llamados" mostraría las
            // filas cacheadas de "Todo".
            (a.canal ?? []).join(','),
            a.validez ?? '',
            (a.autores ?? []).join(','),
        ] as const,
    detalle: (id: number) => ['analitica', 'visita', id] as const,
    detalleLlamado: (id: number) => ['analitica', 'llamado', id] as const,
    objeciones: (a: IObjecionesArgs) =>
        ['analitica', 'objeciones', a.desde, a.hasta, a.zona ?? '', a.rubro ?? ''] as const,
    vendedores: () => ['analitica', 'vendedores'] as const,
    televendedores: () => ['analitica', 'televendedores'] as const,
    criterio: () => ['analitica', 'criterio'] as const,
    altas: (f: IAnaliticaFiltro) =>
        ['analitica', 'altas', f.desde, f.hasta, (f.vendedores ?? []).join(',')] as const,
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

/**
 * El endpoint pagina (50 por defecto, 200 como máximo): pedir solo la primera página
 * cortaba el listado de un mes en silencio — se veía del 28 al 18 y parecía que el
 * filtro de fechas no andaba. Acá se acumulan páginas a demanda (`fetchNextPage`).
 */
export function useVisitasPaginadas(args: Omit<IVisitasArgs, 'pagina'>) {
    return useInfiniteQuery({
        queryKey: [...analiticaKeys.visitas(args), 'paginadas', args.cant ?? 0] as const,
        queryFn: ({ pageParam }) => getVisitas({ ...args, pagina: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (ultima, paginas) => {
            const cargadas = paginas.reduce((a, p) => a + p.visitas.length, 0)
            return cargadas < ultima.total && ultima.visitas.length > 0
                ? ultima.pagina + 1
                : undefined
        },
    })
}

/** Visitas y llamados mezclados (una página). Sin `vendedor` es la vista del equipo. */
export function useContactos(args: IContactosArgs, opciones: OpcionesVisitas = {}) {
    const refrescarCada = opciones.refrescarCada ?? 0
    return useQuery({
        queryKey: analiticaKeys.contactos(args),
        queryFn: () => getContactos(args),
        refetchInterval: refrescarCada > 0 ? refrescarCada : false,
        staleTime: refrescarCada > 0 ? 0 : undefined,
    })
}

/** Como `useVisitasPaginadas`, sobre el feed de contactos. Con `refrescarCada` vuelve a
 *  pedir las páginas ya cargadas (la vista en vivo de actividad). */
export function useContactosPaginados(args: Omit<IContactosArgs, 'pagina'>, opciones: OpcionesVisitas = {}) {
    const refrescarCada = opciones.refrescarCada ?? 0
    return useInfiniteQuery({
        queryKey: [...analiticaKeys.contactos(args), 'paginadas', args.cant ?? 0] as const,
        queryFn: ({ pageParam }) => getContactos({ ...args, pagina: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (ultima, paginas) => {
            const cargadas = paginas.reduce((a, p) => a + p.contactos.length, 0)
            return cargadas < ultima.total && ultima.contactos.length > 0
                ? ultima.pagina + 1
                : undefined
        },
        refetchInterval: refrescarCada > 0 ? refrescarCada : false,
        staleTime: refrescarCada > 0 ? 0 : undefined,
    })
}

/** Los TV cambian menos que el roster de vendedores: misma media hora de caché. */
export function useTelevendedores() {
    return useQuery({
        queryKey: analiticaKeys.televendedores(),
        queryFn: getTelevendedores,
        staleTime: 30 * 60 * 1000,
    })
}

export function useLlamadoDetalle(llamadoId: number | null) {
    return useQuery({
        queryKey: analiticaKeys.detalleLlamado(llamadoId ?? 0),
        queryFn: () => getLlamadoDetalle(llamadoId as number),
        enabled: llamadoId !== null,
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
export function useVendedores(opts?: { enabled?: boolean }) {
    return useQuery({
        queryKey: analiticaKeys.vendedores(),
        queryFn: getVendedores,
        staleTime: 30 * 60 * 1000,
        enabled: opts?.enabled ?? true,
    })
}

export function useAltasRelevadas(filtro: IAnaliticaFiltro) {
    return useQuery({
        queryKey: analiticaKeys.altas(filtro),
        queryFn: () => getAltas(filtro),
    })
}

/** El vínculo cambia la fila del listado (y mueve la ficha, que ve la tab de fichas). */
export function useVincularAlta() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ rotacionClienteId, codigo }: { rotacionClienteId: number; codigo: string }) =>
            vincularAlta(rotacionClienteId, codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['analitica', 'altas'] })
            qc.invalidateQueries({ queryKey: ['analitica', 'fichas'] })
        },
    })
}

/**
 * El criterio con el que el backend valida cada visita. `undefined` mientras carga o si
 * el backend es anterior al endpoint: quien lo use tiene que tolerarlo (ver
 * `TOLERANCIA_METROS` y `describirCriterio` en analiticaFormat). Cambia con un UPDATE
 * a mano en la base, así que una hora de caché alcanza y sobra.
 */
export function useCriterioVisita() {
    return useQuery({
        queryKey: analiticaKeys.criterio(),
        queryFn: getCriterioVisita,
        staleTime: 60 * 60 * 1000,
    }).data
}
