import { pasaFiltro, type FiltroTipo } from './tipoPersona'
import type { IObjecionesPorPersona } from '@/types/metricasEquipo'

export interface IMotivoRanking {
    motivoId: number
    descripcion: string
    cantidad: number
    /** 0..1 sobre el total del recorte. */
    pct: number
}

/**
 * El recorte por tipo de persona. La tarjeta de motivos y la tabla salen de las MISMAS
 * personas: con "Farmer" la tarjeta cuenta solo las objeciones de los farmer, así los dos
 * números nunca se contradicen. Los motivos se recuentan desde las personas.
 */
export function recortarObjeciones(data: IObjecionesPorPersona, filtro: FiltroTipo) {
    const personas = data.personas.filter(p => pasaFiltro([p.tipo], filtro))
    const total = personas.reduce((s, p) => s + p.total, 0)
    const conteo = new Map<number, number>()
    for (const p of personas) for (const m of p.motivos) conteo.set(m.motivoId, (conteo.get(m.motivoId) ?? 0) + m.cantidad)
    const motivos: IMotivoRanking[] = data.motivos
        .map(m => ({ motivoId: m.motivoId, descripcion: m.descripcion, cantidad: conteo.get(m.motivoId) ?? 0 }))
        .filter(m => m.cantidad > 0)
        .map(m => ({ ...m, pct: total > 0 ? m.cantidad / total : 0 }))
        .sort((a, b) => b.cantidad - a.cantidad || a.motivoId - b.motivoId)
    return { total, motivos, personas }
}

export const cantidadDe = (persona: IObjecionesPorPersona['personas'][number], motivoId: number): number =>
    persona.motivos.find(m => m.motivoId === motivoId)?.cantidad ?? 0

/** El motivo que más registró la persona (empate: el que va primero en el ranking del recorte). */
export function motivoPrincipal(
    persona: IObjecionesPorPersona['personas'][number],
    ranking: IMotivoRanking[],
): IMotivoRanking | null {
    let mejor: IMotivoRanking | null = null
    let max = 0
    for (const m of ranking) {
        const c = cantidadDe(persona, m.motivoId)
        if (c > max) {
            max = c
            mejor = m
        }
    }
    return mejor
}

/** Un color por motivo (identidad), validado para daltonismo sobre fondo blanco. Va siempre
 *  junto al nombre del motivo: algunos tienen poco contraste y no se leen solos. */
export const COLORES_MOTIVO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
/** Del noveno motivo en adelante: no se generan colores nuevos. */
export const COLOR_MOTIVO_OTRO = '#94a3b8'

/**
 * El color de cada motivo sale de su lugar en el ranking que manda el backend (`data.motivos`),
 * no del recorte por tipo: así cambiar Vendedor / Farmer / Hunter no repinta los motivos.
 */
export function coloresDeMotivos(motivos: { motivoId: number }[]): Map<number, string> {
    return new Map(motivos.map((m, i) => [m.motivoId, COLORES_MOTIVO[i] ?? COLOR_MOTIVO_OTRO]))
}

/** Una sola gama (azul) de claro a oscuro para la cantidad de cada celda de la tabla. */
export const RAMPA_CALOR = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']

/** El fondo de una celda según su peso (0..1 contra la celda más alta de la tabla). En los
 *  dos tonos más oscuros el texto va en blanco para que se lea. */
export function calorCelda(peso: number): { fondo: string; textoClaro: boolean } {
    const paso = Math.min(RAMPA_CALOR.length - 1, Math.floor(peso * RAMPA_CALOR.length))
    return { fondo: RAMPA_CALOR[paso], textoClaro: paso >= RAMPA_CALOR.length - 2 }
}
