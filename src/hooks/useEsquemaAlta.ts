import { useQuery } from '@tanstack/react-query'
import { getEsquemaAlta } from '@/api/planificacion'

export const esquemaAltaKey = ['alta', 'esquema'] as const

/** Cambia con un deploy de la API (los campos) o una corrección de administración (los
 *  catálogos): ni una cosa ni la otra pasa en la misma jornada. */
const ESQUEMA_STALE_MS = 30 * 60 * 1000

export function useEsquemaAlta(enabled = true) {
    return useQuery({
        queryKey: esquemaAltaKey,
        queryFn: getEsquemaAlta,
        staleTime: ESQUEMA_STALE_MS,
        enabled,
    })
}
