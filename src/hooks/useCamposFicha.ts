import { useQuery } from '@tanstack/react-query'
import { getCamposFicha } from '@/api/planificacion'

export const camposFichaKey = ['ficha', 'campos'] as const

/**
 * El catálogo de "Datos del comercio". Global (no depende del cliente ni del vendedor) y
 * casi inmutable: cambia cuando alguien corre un UPDATE sobre `pl_ficha_campo`, o sea cada
 * varios meses.
 *
 * Por eso `staleTime: Infinity`: se pide una vez por sesión y no se vuelve a pedir ni al
 * cambiar de cliente ni al reabrir el sheet. Si el catálogo cambia mientras el vendedor
 * tiene la app abierta, lo ve al recargar — es exactamente el mismo trato que ya recibe un
 * deploy del front, que es lo que esta pantalla dejó de necesitar.
 *
 * `enabled` lo decide el llamador: el catálogo sólo hace falta con el sheet abierto, y
 * pedirlo al montar la agenda sería un request que la mayoría de las sesiones no usa.
 */
export function useCamposFicha(enabled = true) {
    return useQuery({
        queryKey: camposFichaKey,
        queryFn: getCamposFicha,
        enabled,
        staleTime: Infinity,
        gcTime: Infinity,
    })
}
