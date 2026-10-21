import type {
    Dia,
    IAgendaClientAdmin,
    IClienteRutaBase,
    IRotacionCompleta,
    IRutaBase,
    ISemanaRotacionAdmin,
    ISemanaRutaBase,
} from '@/types/planificacion'

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
    const semanas = moverEnSemanas<IAgendaClientAdmin, ISemanaRotacionAdmin>(
        grid.semanas,
        c => c.rotacionClienteId === rotacionClienteId,
        // El `dia` de la card se actualiza junto con su posición: el grid la ubica por la
        // celda, pero la card lo lleva y quedaría inconsistente con dónde está dibujada.
        c => ({ ...c, dia }),
        semana,
        dia,
    )
    return semanas === grid.semanas ? grid : { ...grid, semanas }
}

/**
 * Lo mismo para la ruta base (`IRutaBase`), con su `id` de fila. Las cards de la ruta base
 * no llevan `dia`: lo da la columna donde están.
 *
 * `posicion` es la del PATCH: el lugar final entre los activos del día destino, sin contar
 * la card movida. Ausente = al final de los activos. Los quitados quedan siempre después,
 * que es como los manda el GET: sin esto la card se dibujaba debajo de ellos hasta el refetch.
 */
export function moverEnRutaBase(
    ruta: IRutaBase,
    id: number,
    semana: number,
    dia: number,
    posicion?: number,
): IRutaBase {
    const semanas = moverEnSemanas<IClienteRutaBase, ISemanaRutaBase>(
        ruta.semanas,
        c => c.id === id,
        c => c,
        semana,
        dia,
        (lista, movida) => {
            const activos = lista.filter(c => !c.eliminado)
            const quitados = lista.filter(c => c.eliminado)
            const lugar = Math.min(posicion ?? activos.length, activos.length)
            return [...activos.slice(0, lugar), movida, ...activos.slice(lugar), ...quitados]
        },
    )
    return semanas === ruta.semanas ? ruta : { ...ruta, semanas }
}

/**
 * El núcleo de los dos: saca la card que cumple `esLaCard` y la pone en (semana, dia).
 * `insertar` decide dónde entra en la lista del día destino (ya sin la card); ausente, al
 * final. Devuelve el MISMO array si algo no cierra, para que el caller devuelva el original.
 */
function moverEnSemanas<C, S extends { semana: number; dias: Record<Dia, C[]> }>(
    semanas: S[],
    esLaCard: (c: C) => boolean,
    mover: (c: C) => C,
    semana: number | undefined,
    dia: number,
    insertar: (lista: C[], movida: C) => C[] = (lista, movida) => [...lista, movida],
): S[] {
    const diaKey = DIAS[dia - 1]
    if (!diaKey) return semanas

    // Dónde está hoy la fila, para saber de dónde sacarla y resolver la semana destino
    // cuando el movimiento es solo de día.
    let semanaOrigen: number | undefined
    let card: C | undefined
    for (const s of semanas) {
        for (const d of DIAS) {
            const encontrada = s.dias[d].find(esLaCard)
            if (encontrada) {
                semanaOrigen = s.semana
                card = encontrada
                break
            }
        }
        if (card) break
    }
    if (!card || semanaOrigen === undefined) return semanas

    const semanaDestino = semana ?? semanaOrigen
    if (!semanas.some(s => s.semana === semanaDestino)) return semanas

    const movida = mover(card)

    return semanas.map(s => {
        const esOrigen = s.semana === semanaOrigen
        const esDestino = s.semana === semanaDestino
        if (!esOrigen && !esDestino) return s

        const dias = { ...s.dias }
        if (esOrigen) {
            for (const d of DIAS) {
                dias[d] = dias[d].filter(c => !esLaCard(c))
            }
        }
        if (esDestino) dias[diaKey] = insertar(dias[diaKey], movida)

        return { ...s, dias }
    })
}
