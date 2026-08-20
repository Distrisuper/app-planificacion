import type { IAccionComercial, IOfrecimientoMotivo } from '@/types/planificacion'

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
