import { useEffect, useRef, useState } from 'react'

/** Sin React salvo por el hook: es lógica de un solo input numérico controlado, compartida
 *  entre precio.tsx y flete.tsx para no duplicarla (los cuatro campos de precio/flete son
 *  `inputMode="decimal"`). */

/** Solo dígitos y a lo sumo un punto — lo que puede ser un decimal a medio tipear ("150.",
 *  "150.5") o vacío. Cualquier otra cosa (dos puntos, letras) no es un número en tránsito. */
const DECIMAL_EN_TRANSITO = /^\d*\.?\d*$/

function aTexto(valor: number | null | undefined): string {
    return valor === null || valor === undefined ? '' : String(valor)
}

/** Gestiona el texto de un input numérico mientras se tipea, para que:
 *  - el punto decimal no se trunque ("150." se muestra tal cual hasta completar "150.50"),
 *  - nunca se muestre el string literal "NaN" (una entrada rota, ej. pegar "1..2", se refleja
 *    tal cual el usuario la escribió, pero no se commitea ni se deriva a partir de un `Number`
 *    inválido).
 *
 *  `onCommit` solo se llama con `number | null` — la forma del dato en `ValoresMotivo` no
 *  cambia. Se llama en cada tipeo que resulta en un número completo (o en vacío → null), no
 *  solo al perder el foco. */
export function useCampoNumero(
    valorExterno: number | null | undefined,
    onCommit: (valor: number | null) => void,
): [string, (textoIngresado: string) => void] {
    const [texto, setTexto] = useState(() => aTexto(valorExterno))
    // Lo último que ESTE hook commiteó, para distinguir "el padre cambió el valor por su
    // cuenta" (hay que resincronizar el texto) de "el padre solo está reflejando lo que
    // nosotros mismos acabamos de commitear" (no tocar el texto en tránsito, ej. "150.").
    const ultimoCommit = useRef<number | null>(
        valorExterno === undefined ? null : valorExterno,
    )

    useEffect(() => {
        const externo = valorExterno === undefined ? null : valorExterno
        if (externo !== ultimoCommit.current) {
            ultimoCommit.current = externo
            setTexto(aTexto(externo))
        }
    }, [valorExterno])

    function onChange(textoIngresado: string) {
        const limpio = textoIngresado.replace(/[^0-9.]/g, '')
        setTexto(limpio)

        if (limpio === '') {
            ultimoCommit.current = null
            onCommit(null)
            return
        }
        if (!DECIMAL_EN_TRANSITO.test(limpio) || limpio.endsWith('.')) {
            // "1..2" (roto) o "150." (decimal a medio tipear): se ve tal cual se tipeó, pero
            // todavía no hay un número completo para commitear.
            return
        }
        const numero = Number(limpio)
        if (Number.isFinite(numero)) {
            ultimoCommit.current = numero
            onCommit(numero)
        }
    }

    return [texto, onChange]
}
