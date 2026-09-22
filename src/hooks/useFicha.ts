import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actualizarFicha } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import type { IAgendaClient, IFichaCliente, SemanaAgenda } from '@/types/planificacion'

interface Vars {
    codigoParticularCliente: string
    valores: Record<string, string[]>
}

/**
 * "Datos del comercio". Al confirmar, la ficha nueva se escribe DIRECTO en la caché de la
 * agenda (setQueryData) y no sólo se invalida: el gate de VisitaFlow lee
 * `cliente.ficha.pendientes` de la card, y con un refetch en vuelo la card seguiría diciendo
 * "pendiente" hasta el próximo staleTime. Un mismo cliente puede estar en varias celdas
 * (quincenal), así que se recorren todos los días.
 */
export function useActualizarFicha() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: Vars) => actualizarFicha(vars.codigoParticularCliente, vars.valores),
        onSuccess: (ficha: IFichaCliente, vars) => {
            qc.setQueryData<SemanaAgenda>(agendaKeys.semana, semana => {
                if (!semana) return semana
                const conFicha = (c: IAgendaClient) =>
                    c.codigoParticularCliente === vars.codigoParticularCliente ? { ...c, ficha } : c
                const out = { ...semana } as SemanaAgenda
                for (const dia of Object.keys(semana) as (keyof SemanaAgenda)[]) {
                    out[dia] = semana[dia].map(conFicha)
                }
                return out
            })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}
