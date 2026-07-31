import type { IRubroMotivo } from '@/types/planificacion'

type Borrador = Record<number, IRubroMotivo[]>

function key(visitaId: number): string {
    return `visita-borrador-${visitaId}`
}

/** null si no hay borrador guardado, o si lo que hay no es JSON válido (dato
 *  corrupto o de una versión vieja): en ese caso se arranca en limpio desde los
 *  motivos que ya trae el servidor. */
export function leerBorrador(visitaId: number): Borrador | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as Borrador
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
