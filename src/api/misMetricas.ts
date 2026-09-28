import { apiClient } from './apiClient'
import type { IMisMetricas } from '@/types/misMetricas'

export async function getMisMetricas(desde: string, hasta: string): Promise<IMisMetricas> {
    return (await apiClient.get('/planificacion/mis-metricas', { params: { desde, hasta } })).data.data
}
