import type { IAccionComercial, IMarcaOfrecida, IOfrecimientoMotivo } from '@/types/planificacion'

/** Claves por ofrecimientoId. */
type Borrador = Record<number, IOfrecimientoMotivo[]>

function key(visitaId: number): string {
    return `visita-borrador-${visitaId}`
}

/** Un motivo de la forma nueva trae `valores`; el de la vieja traía marca/competidor/
 *  pctDiferencia sueltos. Los dos son JSON válido, así que el try/catch no alcanza. */
function esFormaNueva(borrador: unknown): boolean {
    if (typeof borrador !== 'object' || borrador === null) return false
    return Object.values(borrador as Record<string, unknown>).every(
        lista =>
            Array.isArray(lista) &&
            lista.every(m => typeof m === 'object' && m !== null && 'valores' in m),
    )
}

/** null si no hay borrador guardado, si lo que hay no es JSON válido, o si tiene la forma
 *  anterior al detalle por motivo: en cualquiera de los tres casos se arranca en limpio desde
 *  los motivos que ya trae el servidor. Descartar es correcto y no una pérdida: lo que estaba
 *  guardado contra el servidor sigue estando. */
export function leerBorrador(visitaId: number): Borrador | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    try {
        const parsed = JSON.parse(raw) as Borrador
        return esFormaNueva(parsed) ? parsed : null
    } catch {
        return null
    }
}

export function guardarBorrador(visitaId: number, borrador: Borrador): void {
    localStorage.setItem(key(visitaId), JSON.stringify(borrador))
}

export function limpiarBorrador(visitaId: number): void {
    localStorage.removeItem(key(visitaId))
}

/** Borrador de acciones comerciales, por ofrecimientoId. Va en su propia clave y no
 *  dentro de `Borrador`: cambiar la forma del borrador de motivos obligaría a tocar
 *  VisitaSheet, el wizard y su pie a la vez, y dejaría ilegibles los borradores que ya
 *  hay guardados de una visita en curso. */
type BorradorDetalles = Record<number, IAccionComercial | null>

function keyDetalles(visitaId: number): string {
    return `visita-detalles-${visitaId}`
}

export function leerDetalles(visitaId: number): BorradorDetalles | null {
    const raw = localStorage.getItem(keyDetalles(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as BorradorDetalles
    } catch {
        return null
    }
}

export function guardarDetalles(visitaId: number, detalles: BorradorDetalles): void {
    localStorage.setItem(keyDetalles(visitaId), JSON.stringify(detalles))
}

export function limpiarDetalles(visitaId: number): void {
    localStorage.removeItem(keyDetalles(visitaId))
}

/** Observación libre de la visita, en su propia clave.
 *
 *  Clave propia y no un campo dentro de `Borrador`, por la misma razón documentada arriba
 *  para `detalles`: cambiar la forma del borrador de motivos obliga a tocar VisitaSheet,
 *  el wizard y su pie a la vez, y dejaría ilegibles los borradores ya guardados de las
 *  visitas en curso (`leerBorrador` descarta lo que no matchea la forma esperada).
 *
 *  Se guarda como string crudo, sin JSON: es un texto, no una estructura, así que no hay
 *  forma de que quede ilegible y no necesita el try/catch que sí necesitan los otros dos. */
function keyObservaciones(visitaId: number): string {
    return `visita-observaciones-${visitaId}`
}

export function leerObservaciones(visitaId: number): string | null {
    return localStorage.getItem(keyObservaciones(visitaId))
}

export function guardarObservaciones(visitaId: number, texto: string): void {
    localStorage.setItem(keyObservaciones(visitaId), texto)
}

export function limpiarObservaciones(visitaId: number): void {
    localStorage.removeItem(keyObservaciones(visitaId))
}

/** Marcas ofrecidas por ofrecimientoId (spec 2026-09-16 §5.2). Clave propia por la misma
 *  razón que `detalles`: no romper la forma del borrador de motivos ya guardado. */
export type BorradorMarcas = Record<number, IMarcaOfrecida[]>

function keyMarcas(visitaId: number): string {
    return `visita-marcas-${visitaId}`
}

export function leerMarcasOfrecidas(visitaId: number): BorradorMarcas | null {
    const raw = localStorage.getItem(keyMarcas(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as BorradorMarcas
    } catch {
        return null
    }
}

export function guardarMarcasOfrecidas(visitaId: number, marcas: BorradorMarcas): void {
    localStorage.setItem(keyMarcas(visitaId), JSON.stringify(marcas))
}

export function limpiarMarcasOfrecidas(visitaId: number): void {
    localStorage.removeItem(keyMarcas(visitaId))
}
