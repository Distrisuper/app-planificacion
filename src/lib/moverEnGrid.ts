import type { Dia, IAgendaClientAdmin, IRotacionCompleta } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/**
 * Devuelve el grid con una fila movida a (semana, dia), sin tocar el original.
 *
 * Existe para el update optimista del arrastre: aplicar el movimiento en la caché de
 * React Query hace que la card se mueva al instante, en vez de esperar el round-trip y
 * la relectura del grid completo. Sin esto, cada arrastre se sentía lento aunque la
 * escritura en sí es un UPDATE de dos columnas.
 *
 * `semana` undefined = mover de día dentro de la semana donde ya está, igual que el DTO
 * del backend.
 *
 * Ante cualquier dato que no cierre (fila ausente, semana fuera del set, día inválido)
 * devuelve el grid tal cual: el update optimista nunca debe inventar un estado que el
 * backend no vaya a confirmar. La validación de verdad la hace el servidor.
 */
export function moverEnGrid(
    grid: IRotacionCompleta,
    rotacionClienteId: number,
    semana: number | undefined,
    dia: number,
): IRotacionCompleta {
    const diaKey = DIAS[dia - 1]
    if (!diaKey) return grid

    // Dónde está hoy la fila, para saber de dónde sacarla y resolver la semana destino
    // cuando el movimiento es solo de día.
    let semanaOrigen: number | undefined
    let card: IAgendaClientAdmin | undefined
    for (const s of grid.semanas) {
        for (const d of DIAS) {
            const encontrada = s.dias[d].find(c => c.rotacionClienteId === rotacionClienteId)
            if (encontrada) {
                semanaOrigen = s.semana
                card = encontrada
                break
            }
        }
        if (card) break
    }
    if (!card || semanaOrigen === undefined) return grid

    const semanaDestino = semana ?? semanaOrigen
    if (!grid.semanas.some(s => s.semana === semanaDestino)) return grid

    // El `dia` de la card se actualiza junto con su posición: el grid la ubica por la
    // celda, pero la card lo lleva y quedaría inconsistente con dónde está dibujada.
    const movida: IAgendaClientAdmin = { ...card, dia }

    return {
        ...grid,
        semanas: grid.semanas.map(s => {
            const esOrigen = s.semana === semanaOrigen
            const esDestino = s.semana === semanaDestino
            if (!esOrigen && !esDestino) return s

            const dias = { ...s.dias }
            if (esOrigen) {
                for (const d of DIAS) {
                    dias[d] = dias[d].filter(
                        c => c.rotacionClienteId !== rotacionClienteId,
                    )
                }
            }
            if (esDestino) dias[diaKey] = [...dias[diaKey], movida]

            return { ...s, dias }
        }),
    }
}
