import type { IRubroEstado, IRubroPropuesta, IVisitaRubro } from '@/types/planificacion'

/** Presente ⇒ segunda línea con el botón de resolución. Sólo en la visita. */
export interface IRubroFilaResolucion {
    visitaRubroId: number
    motivosCargados: number
    completo: boolean
    /** false ⇒ se agregó dinámicamente (no viene de la propuesta congelada):
     *  la tarjeta ofrece "Quitar rubro" al lado de la Resolución. Los de la
     *  propuesta no se pueden borrar (el backend responde RUBRO_DE_PROPUESTA). */
    esPropuesto: boolean
}

export interface IRubroFila {
    rubroCode: string
    nombre: string
    actual: number | null
    mesAnterior: number | null
    promedio6m: number | null
    /** Barra navy + negrita: está en la propuesta, o en la visita. */
    destacada: boolean
    /** Presente ⇒ segunda línea con el botón de resolución. Sólo en la visita. */
    resolucion?: IRubroFilaResolucion
    /** true ⇒ ＋ al final de la fila. Sólo en la visita, expandida y editable. */
    agregable?: boolean
}

export interface IRubroFilaTotales {
    actual: number | null
    mesAnterior: number | null
    promedio6m: number | null
}

function porCode(rubroStatus: IRubroEstado[]): Map<string, IRubroEstado> {
    return new Map(rubroStatus.map(r => [r.rubroCode, r]))
}

function suma(valores: (number | null)[]): number | null {
    const presentes = valores.filter((v): v is number => v != null)
    if (presentes.length === 0) return null
    return presentes.reduce((a, b) => a + b, 0)
}

/** Suma cada columna SOLO sobre las filas que recibe — el llamador decide qué es
 *  "visible" pasando la lista colapsada o expandida. */
export function totalesDe(filas: IRubroFila[]): IRubroFilaTotales {
    return {
        actual: suma(filas.map(f => f.actual)),
        mesAnterior: suma(filas.map(f => f.mesAnterior)),
        promedio6m: suma(filas.map(f => f.promedio6m)),
    }
}

/** Colapsada: solo los rubros de la propuesta. Expandida: agrega el resto de los
 *  rubros del cliente (`rubroStatus`) que no estén ya en la propuesta. Los números
 *  salen siempre de `rubroStatus`; si un rubro de la propuesta no aparece ahí, usa
 *  sus propios `current`/`prev` (con `–` donde falten) para no desaparecer de la
 *  pantalla — es justamente el rubro que el vendedor tiene que ofrecer. */
export function construirFilasPropuesta(
    rubrosPropuesta: IRubroPropuesta[],
    rubroStatus: IRubroEstado[],
    expandido: boolean,
): IRubroFila[] {
    const status = porCode(rubroStatus)
    const codesPropuesta = new Set(rubrosPropuesta.map(r => r.rubroCode))

    const bloqueArriba: IRubroFila[] = rubrosPropuesta.map(r => {
        const s = status.get(r.rubroCode)
        return {
            rubroCode: r.rubroCode,
            nombre: r.nombre,
            actual: s ? s.actual : (r.current?.actual ?? null),
            mesAnterior: s ? s.mesAnterior : (r.prev?.actual ?? null),
            promedio6m: s ? s.promedio6m : (r.current?.baseline ?? null),
            destacada: true,
        }
    })

    if (!expandido) return bloqueArriba

    const bloqueAbajo: IRubroFila[] = rubroStatus
        .filter(s => !codesPropuesta.has(s.rubroCode))
        .map(s => ({
            rubroCode: s.rubroCode,
            nombre: s.nombre,
            actual: s.actual,
            mesAnterior: s.mesAnterior,
            promedio6m: s.promedio6m,
            destacada: false,
        }))

    return [...bloqueArriba, ...bloqueAbajo]
}

export interface IEstadoResolucionRubro {
    motivosCargados: number
    completo: boolean
}

/** Colapsada: los rubros de la visita, en el orden que los devuelve el backend —
 *  no se reordena al resolver (ver spec: reordenar dejando pendientes arriba haría
 *  saltar la fila que el vendedor acaba de tocar). Expandida: agrega el resto de los
 *  rubros del cliente, marcados `agregable` cuando la visita es editable. */
export function construirFilasVisita(
    rubrosVisita: IVisitaRubro[],
    rubroStatus: IRubroEstado[],
    estados: Record<number, IEstadoResolucionRubro>,
    expandido: boolean,
    editable: boolean,
): IRubroFila[] {
    const status = porCode(rubroStatus)
    const codesVisita = new Set(rubrosVisita.map(r => r.rubroCode))

    const bloqueArriba: IRubroFila[] = rubrosVisita.map(r => {
        const s = status.get(r.rubroCode)
        const estado = estados[r.id]
        return {
            rubroCode: r.rubroCode,
            nombre: r.rubroDescripcion,
            actual: s?.actual ?? null,
            mesAnterior: s?.mesAnterior ?? null,
            promedio6m: s?.promedio6m ?? null,
            destacada: true,
            resolucion:
                editable && estado
                    ? {
                          visitaRubroId: r.id,
                          motivosCargados: estado.motivosCargados,
                          completo: estado.completo,
                          esPropuesto: r.esPropuesto,
                      }
                    : undefined,
        }
    })

    if (!expandido) return bloqueArriba

    const bloqueAbajo: IRubroFila[] = rubroStatus
        .filter(s => !codesVisita.has(s.rubroCode))
        .map(s => ({
            rubroCode: s.rubroCode,
            nombre: s.nombre,
            actual: s.actual,
            mesAnterior: s.mesAnterior,
            promedio6m: s.promedio6m,
            destacada: false,
            agregable: editable || undefined,
        }))

    return [...bloqueArriba, ...bloqueAbajo]
}
