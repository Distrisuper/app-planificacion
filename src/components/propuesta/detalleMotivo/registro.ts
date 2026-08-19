import type { ComponentType } from 'react'
import { EditorPrecio } from './precio'
import type { IPropsEditorMotivo } from './validadores'
import { EditorPlazo } from './plazo'
import { EditorFlete } from './flete'
import { EditorNoTrabaja } from './noTrabaja'

export type { IPropsEditorMotivo }

export const registroDetalleMotivo: Record<string, ComponentType<IPropsEditorMotivo>> = {
    PRECIO: EditorPrecio,
    PLAZO: EditorPlazo,
    FLETE: EditorFlete,
    NO_TRABAJA: EditorNoTrabaja,
}
