import { validadoresDetalleMotivo } from '@/components/propuesta/detalleMotivo/validadores'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

/** El motivo tildado cuyo módulo dice que le falta algo, o null. Se usa para señalar CUÁL
 *  falta completar, no solo que falta algo.
 *
 *  Un motivo sin `codigo`, o con un `codigo` que todavía no tiene módulo (el catálogo puede
 *  ir por delante del deploy), NUNCA bloquea: si no hay formulario, no hay nada a medias. */
export function motivoIncompleto(
    motivos: IMotivo[],
    value: IOfrecimientoMotivo[],
): IMotivo | null {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    return (
        motivos.find(cat => {
            const seleccionado = porId.get(cat.motivoId)
            if (!seleccionado) return false
            const modulo = cat.codigo ? validadoresDetalleMotivo[cat.codigo] : undefined
            return !!modulo && !modulo.esValido(seleccionado.valores)
        }) ?? null
    )
}

export function tieneDetalleIncompleto(
    motivos: IMotivo[],
    value: IOfrecimientoMotivo[],
): boolean {
    return motivoIncompleto(motivos, value) !== null
}

/** Compara dos listas por contenido, sin importar el orden. La usa VisitaSheet para saber si
 *  un ofrecimiento tiene cambios sin guardar (borrador vs. lo persistido). */
export function motivosIguales(a: IOfrecimientoMotivo[], b: IOfrecimientoMotivo[]): boolean {
    if (a.length !== b.length) return false
    const porId = new Map(a.map(m => [m.motivoId, m]))
    return b.every(m => {
        const otro = porId.get(m.motivoId)
        if (!otro) return false
        const claves = new Set([...Object.keys(otro.valores), ...Object.keys(m.valores)])
        return [...claves].every(k => (otro.valores[k] ?? null) === (m.valores[k] ?? null))
    })
}
