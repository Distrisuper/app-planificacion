import { useQuery } from '@tanstack/react-query'
import { getMotivos } from '@/api/planificacion'

export function useMotivos() {
    return useQuery({
        queryKey: ['motivos'],
        queryFn: getMotivos,
        staleTime: 30 * 60 * 1000,
    })
}
