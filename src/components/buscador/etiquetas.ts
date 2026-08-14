import type { IResultadoBuscadorGeneral } from '@/types/planificacion'

const DIA_NOMBRE = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']

export function diaLabel(dia: number | null): string {
    if (dia === null) return ''
    return DIA_NOMBRE[dia - 1] ?? `día ${dia}`
}

/**
 * Cómo se nombra una zona ante el vendedor: por su nombre ("Zárate"), y el número
 * SOLO cuando esa zona nunca se nombró. Es la misma regla que aplica el header de la
 * agenda (`nombreZona` en AgendaSemanaPage) — el vendedor no ve números de zona.
 */
export function zonaLabel(descripcionZona: string | null, semana: number | null): string {
    if (descripcionZona) return descripcionZona
    return semana !== null ? `zona ${semana}` : 'su zona'
}

/** El estado de un cliente en la vuelta, en una línea. Lo usan los dos buscadores. */
export function etiquetaEstado(r: IResultadoBuscadorGeneral): string {
    switch (r.estado) {
        case 'pendiente':
            return `Pendiente el ${diaLabel(r.dia)} en ${zonaLabel(r.descripcionZona, r.semana)}`
        case 'visitado':
            return r.fecha ? `Visitado el ${fechaCorta(r.fecha)}` : 'Visitado'
        case 'no_visita':
            return r.motivo ? `No visité — ${r.motivo}` : 'No visité'
        case 'sin_plan':
            return 'No está planificado esta vuelta'
    }
}

/**
 * Día y mes en TZ de negocio, no la del dispositivo: la API manda un instante ISO en
 * UTC y `slice(0,10)` sobre él corre la fecha para todo lo cerrado después de las 21hs
 * (ver "Las horas se formatean en TZ de negocio" en CLAUDE.md).
 */
function fechaCorta(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric',
        month: 'short',
    }).format(d)
}
