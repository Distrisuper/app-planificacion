import type { TonoPill } from '@/components/ui/Pill'
import type { EstadoSemanaRotacion } from '@/types/planificacion'

/** 'YYYY-MM-DD' → 'DD/MM'. Sin Date: es una fecha de calendario y no se corre de día por TZ. */
const diaMes = (fecha: string) => {
    const [, mes, dia] = fecha.split('-')
    return `${dia}/${mes}`
}

/**
 * La etiqueta de una fila del grid de gerencia: en qué semana está el vendedor y cuáles ya
 * recorrió. Las pendientes van sin etiqueta para que la que está en curso se vea sola.
 */
export function etiquetaEstadoSemana(
    estado: EstadoSemanaRotacion | undefined,
    fechaLunes: string | null | undefined,
): { texto: string; tono: TonoPill } | null {
    if (estado === 'en_curso' && fechaLunes) {
        return { texto: `En curso · semana del ${diaMes(fechaLunes)}`, tono: 'ok' }
    }
    if (estado === 'hecha' && fechaLunes) {
        return { texto: `Hecha · semana del ${diaMes(fechaLunes)}`, tono: 'neutro' }
    }
    return null
}
