import type { ICatalogoItem } from '@/types/planificacion'

/** Los valores de un motivo, por `campo`. Espeja la tabla pl_ofrecimiento_motivo_campo. */
export type ValoresMotivo = Record<string, string | number | null>

/** Props de cualquier Editor de detalle. Vive acá y no en un módulo concreto para que
 *  plazo.tsx no tenga que importarle el tipo a precio.tsx: son hermanos, ninguno depende del
 *  otro. Es solo una forma, no arrastra React. */
export interface IPropsEditorMotivo {
    valores: ValoresMotivo
    /** Recibe SOLO los campos que cambian; el llamador hace el merge. */
    onChange: (parcial: ValoresMotivo) => void
    /** Para los módulos que eligen de un catálogo. */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

export interface IValidadorDetalleMotivo {
    /** Los `campo` que este motivo escribe, en orden de pantalla. */
    campos: string[]
    /** Habilita Atrás/Siguiente en el wizard: false = detalle a medias. */
    esValido: (valores: ValoresMotivo) => boolean
    /** Una línea para la tabla de ofrecimientos y el detalle de gerencia. */
    resumen: (valores: ValoresMotivo) => string
}

/** Sin React a propósito: `lib/resolucionOfrecimiento.ts` importa de acá, y arrastrar
 *  componentes a un módulo de lib obligaría a su test a montar React sin necesidad. Los
 *  Editors viven en `registro.tsx`. */
function cargado(valor: string | number | null | undefined): boolean {
    if (valor === null || valor === undefined) return false
    if (typeof valor === 'number') return Number.isFinite(valor) && valor !== 0
    return valor.trim() !== ''
}

function todos(valores: ValoresMotivo, campos: string[]): boolean {
    return campos.every(c => cargado(valores[c]))
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

const CAMPOS_PRECIO = ['marca', 'competidor', 'precio_competidor', 'mi_precio']

export const validadoresDetalleMotivo: Record<string, IValidadorDetalleMotivo> = {
    PRECIO: {
        campos: CAMPOS_PRECIO,
        esValido: v => todos(v, CAMPOS_PRECIO),
        resumen: v => {
            const pct = pctVsCompetidor(v)
            const base = `${v.marca ?? ''} vs. ${v.competidor ?? ''}`.trim()
            return pct === null ? base : `${base} · ${pct.toFixed(1)}%`
        },
    },
    PLAZO: {
        campos: ['plazo_dias'],
        esValido: v => cargado(v.plazo_dias),
        resumen: v => `${v.plazo_dias} días`,
    },
    FLETE: {
        campos: ['valor_flete', 'compra_futuro'],
        esValido: v => todos(v, ['valor_flete', 'compra_futuro']),
        resumen: v => {
            const pct = pctFleteSobreCompra(v)
            return pct === null ? 'Flete' : `Flete ${pct.toFixed(1)}% de la compra`
        },
    },
    NO_TRABAJA: {
        campos: ['marca_trabaja', 'por_que'],
        esValido: v => cargado(v.marca_trabaja),
        resumen: v => `Trabaja ${v.marca_trabaja ?? ''}`.trim(),
    },
}
