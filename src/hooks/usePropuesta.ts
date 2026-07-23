import { useQuery } from '@tanstack/react-query'
import { getPropuesta } from '@/api/planificacion'

export function usePropuesta(codigoCliente: string | null) {
    return useQuery({
        queryKey: ['propuesta', codigoCliente],
        queryFn: () => getPropuesta(codigoCliente as string),
        enabled: !!codigoCliente,
    })
}
