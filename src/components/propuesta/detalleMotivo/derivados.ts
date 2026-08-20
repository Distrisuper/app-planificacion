import { pctFleteSobreCompra, pctVsCompetidor, type ValoresMotivo } from './validadores'

export interface IDerivado {
    texto: string
    /** `bueno` = verde, `advertencia` = ámbar. Un tono y no una clase de Tailwind para que el
     *  color lo elija el que dibuja, no cada fórmula. */
    tono: 'bueno' | 'advertencia'
}

/**
 * La línea calculada que va debajo del formulario, por `codigo` del motivo.
 *
 * Es LO ÚNICO que queda en código por motivo, y es deliberado: una fórmula, una frase y un
 * color condicional no se pueden expresar como dato sin inventar un mini-lenguaje de
 * expresiones — ver "Por qué el formulario NO se define en la base" en el spec.
 *
 * Un motivo cuyo `codigo` no está acá (o que no tiene `codigo`) dibuja sus campos igual, sin
 * línea derivada. Sumar un motivo con cálculo es una entrada acá; sumarle un campo a uno
 * existente NO toca este archivo.
 */
export const registroDerivado: Record<string, (v: ValoresMotivo) => IDerivado | null> = {
    // Verde cuando somos más baratos, ámbar cuando no: el vendedor tiene que ver de qué lado
    // está parado ANTES de ofrecer, no después.
    PRECIO: valores => {
        const pct = pctVsCompetidor(valores)
        if (pct === null) return null
        return {
            texto: `${pct.toFixed(1)}% más ${pct <= 0 ? 'barato' : 'caro'} que el competidor`,
            tono: pct <= 0 ? 'bueno' : 'advertencia',
        }
    },
    // "$60.000 de flete" no dice nada solo; "el 2% de la compra" sí.
    FLETE: valores => {
        const pct = pctFleteSobreCompra(valores)
        if (pct === null) return null
        return {
            texto: `El flete representa el ${pct.toFixed(1)}% de la compra`,
            tono: 'advertencia',
        }
    },
}
