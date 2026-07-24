import type { IAgendaClient } from '@/types/planificacion'

const HORAS = ['08:30', '09:15', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00']

function hashCode(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

/**
 * dirección/teléfono ahora son reales desde fct_clients — ya NO se mockean.
 * Lo único que el backend todavía no asigna es la HORA de visita, así que se
 * completa determinísticamente (estable por código de cliente, no aleatoria en
 * cada render) para sostener el diseño del card. Borrar cuando la agenda asigne
 * horarios reales — ver IAgendaClient.horaVisita.
 */
export function withMockVisualData(cliente: IAgendaClient): IAgendaClient {
    const h = hashCode(cliente.codigoParticularCliente)
    return {
        ...cliente,
        horaVisita: cliente.horaVisita ?? HORAS[h % HORAS.length],
    }
}
