import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actualizarFicha } from '@/api/planificacion'
import { agendaKeys } from './useAgenda'
import { cicloKeys } from './useCiclo'
import type { IAgendaClient, IFichaCliente, IPreviewCiclo, SemanaAgenda } from '@/types/planificacion'

interface Vars {
    codigoParticularCliente: string
    valores: Record<string, string[]>
}

/**
 * "Datos del comercio". Al confirmar, la ficha nueva se escribe DIRECTO en la caché
 * (setQueryData) y no sólo se invalida: el gate de VisitaFlow lee `cliente.ficha.pendientes`
 * de la card, y con un refetch en vuelo la card seguiría diciendo "pendiente" hasta el
 * próximo staleTime. Un mismo cliente puede estar en varias celdas (quincenal), así que se
 * recorren todos los días.
 *
 * **Se parchean LAS DOS queries que dibujan la agenda**, no sólo la obvia:
 *
 * - `['agenda','semana']` — con ciclo abierto en la semana que se está viendo.
 * - `['ciclo','preview',N]` — sin ciclo abierto (standby). Es el caso de casi todos los
 *   lunes, y el del vendedor de prueba recién reiniciado.
 *
 * Parchear sólo la primera es el bug del 22/09: el PUT guardaba, el backend devolvía
 * `pendientes: []`, y el gate volvía a pedir la ficha entera porque la card que el front
 * tenía en mano venía del preview y ahí nadie la había tocado.
 */
export function useActualizarFicha() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: Vars) => actualizarFicha(vars.codigoParticularCliente, vars.valores),
        onSuccess: (ficha: IFichaCliente, vars) => {
            const conFicha = (c: IAgendaClient) =>
                c.codigoParticularCliente === vars.codigoParticularCliente ? { ...c, ficha } : c
            const porDia = (dias: Record<string, IAgendaClient[]>) => {
                const out = { ...dias }
                for (const dia of Object.keys(dias)) out[dia] = dias[dia].map(conFicha)
                return out
            }

            qc.setQueryData<SemanaAgenda>(agendaKeys.semana, semana =>
                semana ? (porDia(semana as unknown as Record<string, IAgendaClient[]>) as unknown as SemanaAgenda) : semana,
            )
            // `setQueriesData` con el prefijo y no `setQueryData` con la key exacta: la semana
            // previsualizada es parte de la key, y acá no se sabe cuál está montada.
            qc.setQueriesData<IPreviewCiclo>({ queryKey: cicloKeys.previewTodos }, prev =>
                prev ? { ...prev, dias: porDia(prev.dias) as IPreviewCiclo['dias'] } : prev,
            )

            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: cicloKeys.previewTodos })
        },
    })
}
