import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cerrarVisita,
    getVisitaActiva,
    iniciarVisita,
    registrarNoVisita,
    reintentarSeguimiento,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { ICerrarVisitaDTO, IIniciarVisitaDTO, INoVisitaDTO } from '@/types/planificacion'

export const visitaKeys = { activa: ['visita-activa'] as const }

/** `enabled` default true. VisitaSheet lo pide solo con el sheet abierto y la visita sin
 *  cerrar (ver el gate de los 15 min): sin este control, cada card cerrada de la agenda
 *  dispararía el mismo GET sin necesitarlo.
 *
 *  `refetchOnMount: 'always'` es obligatorio, no cosmético: `queryClient.ts` tiene
 *  `refetchOnMount: false` de base. Sin este override, cuando el vendedor cierra una
 *  visita y arranca otra, `VisitaSheet` de la visita VIEJA se desmonta antes de que la
 *  invalidación de `useIniciarVisita` tenga algún observer activo al que refetchear
 *  (`invalidateQueries` por defecto solo refresca queries activas) — así que la caché
 *  queda con el `id` de la visita anterior, invalidada pero sin refetchear. El
 *  `VisitaSheet` de la visita NUEVA monta un instante después, `refetchOnMount: false`
 *  le sirve ese dato viejo sin pedir nada nuevo, y el `id` no coincide: dispara el
 *  fail-open del gate de tiempo y deja cerrar sin esperar los 15 minutos. Con
 *  `'always'`, cada montaje pide la verdad actual sin importar qué haya en caché. */
export function useVisitaActiva(enabled: boolean = true) {
    return useQuery({
        queryKey: visitaKeys.activa,
        queryFn: getVisitaActiva,
        enabled,
        refetchOnMount: 'always',
    })
}

function useMutacionDeVisita<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
    const qc = useQueryClient()
    return useMutation({
        // Envuelta (no pasada directo) para que solo las `variables` reales lleguen a la
        // función: React Query v5 llama a mutationFn con un segundo argumento de contexto,
        // que si no se filtraría en los toHaveBeenCalledWith de los tests.
        mutationFn: fn,
        onSuccess: () => {
            // `refetchType: 'all'`, no el default 'active': justo después de iniciar o
            // cerrar una visita puede no haber ningún VisitaSheet montado todavía (se
            // desmontó al volver a la agenda, o el nuevo recién va a montarse), así que
            // 'active' no refrescaría nada — la caché quedaría invalidada pero con el dato
            // viejo hasta el próximo mount. Es la otra mitad del fix junto con
            // `refetchOnMount: 'always'` en `useVisitaActiva`: acá se dispara la reposición
            // en cuanto cambia la verdad del servidor; allá, por si ese refetch en segundo
            // plano no llegó a tiempo, se vuelve a pedir al montar igual.
            qc.invalidateQueries({ queryKey: visitaKeys.activa, refetchType: 'all' })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.actual })
        },
    })
}

export function useIniciarVisita() {
    return useMutacionDeVisita((dto: IIniciarVisitaDTO) => iniciarVisita(dto))
}

/** Sin motivoIds: el resultado comercial vive en los ofrecimientos. */
export function useCerrarVisita() {
    return useMutacionDeVisita((args: { visitaId: number } & ICerrarVisitaDTO) =>
        cerrarVisita(args.visitaId, { coordFinal: args.coordFinal }),
    )
}

export function useNoVisita() {
    return useMutacionDeVisita((dto: INoVisitaDTO) => registrarNoVisita(dto))
}

/** Reintento manual del aviso a Cromo desde la agenda (botón "Reintentar sincronización",
 *  visible cuando `seguimiento.estado === 'pendiente'`). Invalida la agenda igual que las
 *  otras mutaciones de visita: un reintento exitoso saca a la fila de `pendiente`, y la
 *  única forma de que el botón desaparezca es que la agenda se vuelva a leer. */
export function useReintentarSeguimiento() {
    return useMutacionDeVisita((resolucionId: number) => reintentarSeguimiento(resolucionId))
}
