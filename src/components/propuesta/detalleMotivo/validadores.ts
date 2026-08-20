import type { ICampoMotivo, TipoCampoMotivo } from '@/types/planificacion'

/** Los valores de un motivo, por `campo`. Espeja la tabla pl_ofrecimiento_motivo_campo. */
export type ValoresMotivo = Record<string, string | number | null>

/** Los `tipo` que el front sabe dibujar. Uno fuera de esta lista viene de una declaración más
 *  nueva que este deploy: no se dibuja y, por lo mismo, no se exige. */
export const TIPOS_RENDERIZABLES = new Set<TipoCampoMotivo>([
    'numero',
    'texto',
    'textarea',
    'catalogo_marca',
])

/** Sin React a propósito: `lib/resolucionOfrecimiento.ts` importa de acá, y arrastrar
 *  componentes a un módulo de lib obligaría a su test a montar React sin necesidad. */
export function cargado(valor: string | number | null | undefined): boolean {
    if (valor === null || valor === undefined) return false
    if (typeof valor === 'number') return Number.isFinite(valor) && valor !== 0
    return valor.trim() !== ''
}

/** Si el detalle está completo según lo que declara el back. Reemplaza al `esValido` que cada
 *  módulo traía hardcodeado: ahora "qué es obligatorio" es dato. */
export function esValidoSegunDeclaracion(
    campos: ICampoMotivo[],
    valores: ValoresMotivo,
): boolean {
    return campos
        .filter(c => c.requerido && TIPOS_RENDERIZABLES.has(c.tipo))
        .every(c => cargado(valores[c.campo]))
}

/** Cuánto más barato (negativo) o caro (positivo) soy respecto del competidor. */
export function pctVsCompetidor(valores: ValoresMotivo): number | null {
    const suyo = Number(valores.precio_competidor)
    const mio = Number(valores.mi_precio)
    if (!Number.isFinite(suyo) || !Number.isFinite(mio) || suyo === 0) return null
    return ((mio - suyo) / suyo) * 100
}

/** Qué porcentaje de la compra futura se lleva el flete. */
export function pctFleteSobreCompra(valores: ValoresMotivo): number | null {
    const flete = Number(valores.valor_flete)
    const compra = Number(valores.compra_futuro)
    if (!Number.isFinite(flete) || !Number.isFinite(compra) || compra === 0) return null
    return (flete / compra) * 100
}
