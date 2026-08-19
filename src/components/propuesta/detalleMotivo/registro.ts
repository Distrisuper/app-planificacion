import type { ComponentType } from 'react'
import { EditorPrecio } from './precio'
import type { IPropsEditorMotivo } from './validadores'

export type { IPropsEditorMotivo }

/** Un módulo por motivo, buscado por `IMotivo.codigo`. Sumar un motivo con detalle es un
 *  archivo como precio.tsx más una entrada acá — no se toca ResolucionOfrecimiento.
 *
 *  La parte pura (campos/esValido/resumen) vive en `validadores.ts`, que `lib/` importa sin
 *  arrastrar React. Acá viven solo los Editors. */
export const registroDetalleMotivo: Record<string, ComponentType<IPropsEditorMotivo>> = {
    PRECIO: EditorPrecio,
}
