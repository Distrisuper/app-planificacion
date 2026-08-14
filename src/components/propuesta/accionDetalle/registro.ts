import type { ComponentType } from 'react'
import { EditorCupo, esValidoCupo, resumenCupo, type ICupoDetalle } from './cupo'
import { EditorDescuento, esValidoDescuento, resumenDescuento, type IDescuentoDetalle } from './descuento'

/** Contrato que cualquier acción nueva cumple para sumarse al registro: un editor para
 *  el alta, un resumen de una línea para la tabla, y una validación para habilitar
 *  "Agregar" en AgregarOfrecimientoSheet. Sumar una acción nueva (Descuento, Promo,
 *  Cobranza) es un archivo como cupo.tsx + una entrada acá — no hay que tocar
 *  AgregarOfrecimientoSheet ni OfrecimientoTable de nuevo. */
export interface IModuloDetalleAccion<T = unknown> {
    Editor: ComponentType<{ value: T | undefined; onChange: (v: T) => void }>
    resumen: (detalle: T) => string
    esValido: (detalle: T | undefined) => boolean
    /** 'inline' = el editor entra en la misma fila que el selector de acción (un campo
     *  chico, ej. Descuento). 'stack' (default) = va debajo en su propio bloque, para
     *  editores que no entran en una línea (ej. Cupo, lista de tramos). */
    layout?: 'inline' | 'stack'
}

const moduloCupo: IModuloDetalleAccion<ICupoDetalle> = {
    Editor: EditorCupo,
    resumen: resumenCupo,
    esValido: esValidoCupo,
    // Se probó 'inline' (compartir fila con el selector): con índice + monto + M/K +
    // % + quitar, no entraba cómodo en la mitad de una pantalla chica. Va debajo, en
    // su propio bloque de ancho completo — igual se compactó con el monto en M/K.
    layout: 'stack',
}

const moduloDescuento: IModuloDetalleAccion<IDescuentoDetalle> = {
    Editor: EditorDescuento,
    resumen: resumenDescuento,
    esValido: esValidoDescuento,
    layout: 'inline',
}

// `any` en el valor del Record a propósito: cada módulo es internamente consistente
// (Editor/resumen/esValido comparten el mismo T), pero el registro es heterogéneo —
// distintas acciones van a tener distintas formas de detalle.
export const registroDetalleAccion: Record<string, IModuloDetalleAccion<any>> = {
    CUPO: moduloCupo,
    DESCUENTO: moduloDescuento,
}
