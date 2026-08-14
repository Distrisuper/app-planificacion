import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

/** Un motivo con requiereDetalle exige los tres campos; el backend valida lo mismo
 *  (MOTIVO_DETALLE_REQUERIDO) — acá se previene para no gastar un viaje. */
export function detalleCompleto(m: IOfrecimientoMotivo): boolean {
    return !!m.marca?.trim() && !!m.competidor?.trim() && m.pctDiferencia !== null
}

/** El motivo con requiereDetalle que está tildado sin el detalle completo, o null si no
 *  hay ninguno. Se usa para señalar CUÁL motivo falta completar, no solo que falta algo. */
export function motivoIncompleto(motivos: IMotivo[], value: IOfrecimientoMotivo[]): IMotivo | null {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    return (
        motivos.find(
            cat => cat.requiereDetalle && porId.has(cat.motivoId) && !detalleCompleto(porId.get(cat.motivoId)!),
        ) ?? null
    )
}

export function tieneDetalleIncompleto(motivos: IMotivo[], value: IOfrecimientoMotivo[]): boolean {
    return motivoIncompleto(motivos, value) !== null
}

/** Compara dos listas de IOfrecimientoMotivo por contenido, sin importar el orden. La usa el
 *  wizard para saber si un ofrecimiento tiene cambios sin guardar (borrador vs. lo persistido). */
export function motivosIguales(a: IOfrecimientoMotivo[], b: IOfrecimientoMotivo[]): boolean {
    if (a.length !== b.length) return false
    const porId = new Map(a.map(m => [m.motivoId, m]))
    return b.every(m => {
        const otro = porId.get(m.motivoId)
        return (
            !!otro &&
            otro.marca === m.marca &&
            otro.competidor === m.competidor &&
            otro.pctDiferencia === m.pctDiferencia
        )
    })
}
