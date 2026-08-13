import type { IAlcance, IOfrecimiento, IRubroEstado, IRubroPropuesta, TipoOfrecimiento } from '@/types/planificacion'

/** Presente ⇒ segunda línea con el botón de resolución. Sólo en la visita. */
export interface IOfrecimientoFilaResolucion {
    ofrecimientoId: number
    motivosCargados: number
    completo: boolean
    /** false ⇒ se agregó dinámicamente (no viene de la propuesta congelada):
     *  la tarjeta ofrece "Quitar" al lado de la Resolución. Los de la
     *  propuesta no se pueden borrar (el backend responde OFRECIMIENTO_DE_PROPUESTA). */
    esPropuesto: boolean
}

export interface IOfrecimientoFila {
    codigo: string
    nombre: string
    actual: number | null
    mesAnterior: number | null
    promedio6m: number | null
    /** Barra navy + negrita: está en la propuesta, o en la visita. */
    destacada: boolean
    /** Presente ⇒ segunda línea con el botón de resolución. Sólo en la visita. */
    resolucion?: IOfrecimientoFilaResolucion
    /** true ⇒ ＋ al final de la fila. Sólo en la visita, expandida y editable. */
    agregable?: boolean
    /** 'rubro' para todo lo que viene del motor de propuesta / rubroStatus. Los
     *  agregados a mano pueden traer cualquier TipoOfrecimiento. */
    tipo: TipoOfrecimiento
    alcance: IAlcance[]
    detalle?: unknown
}

export interface IOfrecimientoFilaTotales {
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
export function totalesDe(filas: IOfrecimientoFila[]): IOfrecimientoFilaTotales {
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
): IOfrecimientoFila[] {
    const status = porCode(rubroStatus)
    const codesPropuesta = new Set(rubrosPropuesta.map(r => r.rubroCode))

    const bloqueArriba: IOfrecimientoFila[] = rubrosPropuesta.map(r => {
        const s = status.get(r.rubroCode)
        return {
            codigo: r.rubroCode,
            nombre: r.nombre,
            actual: s ? s.actual : (r.current?.actual ?? null),
            mesAnterior: s ? s.mesAnterior : (r.prev?.actual ?? null),
            promedio6m: s ? s.promedio6m : (r.current?.baseline ?? null),
            destacada: true,
            tipo: 'rubro',
            alcance: [],
        }
    })

    if (!expandido) return bloqueArriba

    const bloqueAbajo: IOfrecimientoFila[] = rubroStatus
        .filter(s => !codesPropuesta.has(s.rubroCode))
        .map(s => ({
            codigo: s.rubroCode,
            nombre: s.nombre,
            actual: s.actual,
            mesAnterior: s.mesAnterior,
            promedio6m: s.promedio6m,
            destacada: false,
            tipo: 'rubro',
            alcance: [],
        }))

    return [...bloqueArriba, ...bloqueAbajo]
}

export interface IEstadoResolucionOfrecimiento {
    motivosCargados: number
    completo: boolean
}

/** Colapsada: los ofrecimientos de la visita, en el orden que los devuelve el backend —
 *  no se reordena al resolver (ver spec: reordenar dejando pendientes arriba haría
 *  saltar la fila que el vendedor acaba de tocar). Expandida: agrega el resto de los
 *  rubros del cliente, marcados `agregable` cuando la visita es editable. */
export function construirFilasVisita(
    ofrecimientosVisita: IOfrecimiento[],
    rubroStatus: IRubroEstado[],
    estados: Record<number, IEstadoResolucionOfrecimiento>,
    expandido: boolean,
    editable: boolean,
): IOfrecimientoFila[] {
    const status = porCode(rubroStatus)
    const codesVisita = new Set(ofrecimientosVisita.map(r => r.codigo))

    const bloqueArriba: IOfrecimientoFila[] = ofrecimientosVisita.map(r => {
        const s = status.get(r.codigo)
        const estado = estados[r.id]
        return {
            codigo: r.codigo,
            nombre: r.descripcion,
            actual: s?.actual ?? null,
            mesAnterior: s?.mesAnterior ?? null,
            promedio6m: s?.promedio6m ?? null,
            destacada: true,
            tipo: r.tipo,
            alcance: r.alcance,
            detalle: r.detalle,
            resolucion:
                editable && estado
                    ? {
                          ofrecimientoId: r.id,
                          motivosCargados: estado.motivosCargados,
                          completo: estado.completo,
                          esPropuesto: r.esPropuesto,
                      }
                    : undefined,
        }
    })

    if (!expandido) return bloqueArriba

    const bloqueAbajo: IOfrecimientoFila[] = rubroStatus
        .filter(s => !codesVisita.has(s.rubroCode))
        .map(s => ({
            codigo: s.rubroCode,
            nombre: s.nombre,
            actual: s.actual,
            mesAnterior: s.mesAnterior,
            promedio6m: s.promedio6m,
            destacada: false,
            agregable: editable || undefined,
            tipo: 'rubro',
            alcance: [],
        }))

    return [...bloqueArriba, ...bloqueAbajo]
}

/** Separa las filas de acción (Plan cupo, etc.) del resto: una acción no tiene venta
 *  histórica por rubro y se muestra en su propia sección, arriba de la tabla
 *  RUBRO·ACTUAL·M.ANT·P.6M (ver OfrecimientoTable). Puro: no reordena ninguna lista. */
export function separarAcciones(filas: IOfrecimientoFila[]): {
    acciones: IOfrecimientoFila[]
    resto: IOfrecimientoFila[]
} {
    return {
        acciones: filas.filter(f => f.tipo === 'accion'),
        resto: filas.filter(f => f.tipo !== 'accion'),
    }
}
