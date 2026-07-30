import { useQuery } from '@tanstack/react-query'
import { getRubroStatus } from '@/api/planificacion'

/** "Ver versus": todos los rubros del cliente (Actual/M.Ant/Prom.6M). Independiente
 *  de usePropuesta — no comparte datos con la lista de caídas/recomendación. */
export function useRubroStatus(codigoParticularCliente: string | null) {
    return useQuery({
        queryKey: ['rubroStatus', codigoParticularCliente],
        queryFn: () => getRubroStatus(codigoParticularCliente as string),
        enabled: !!codigoParticularCliente,
    })
}
