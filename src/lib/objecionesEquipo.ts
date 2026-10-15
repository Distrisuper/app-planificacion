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
