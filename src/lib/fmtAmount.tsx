import React from 'react'

const FMT0 = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
})

const NBSP = ' '

/**
 * Formatea un importe en pesos ARS mostrándolo en miles (sin sufijo).
 *
 * - 0 o < 500 pesos              → '–'
 * - 940.911 pesos                → '$ 941' (el "$" se ve más chico y gris; el signo "-" no)
 * - 1.350.000 pesos              → '$ 1.350'
 * - 11.858.000 pesos             → '$ 11.858'
 *
 * El espacio entre el signo y el número es un non-breaking space: algunas celdas
 * angostas no fuerzan `whitespace-nowrap`, y un espacio normal permitiría que el
 * navegador corte la línea justo ahí.
 *
 * Si el texto excede 7 chars, achica la fuente en em para que siempre entre en celda.
 */
export function fmtAmount(value: number): React.ReactNode {
    if (value === 0) return '–'
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''

    const inThousands = Math.round(abs / 1_000)
    if (inThousands === 0) return '–'

    const numberText = FMT0.format(inThousands)
    const plainText = `${sign}$${NBSP}${numberText}`
    const content = (
        <>
            {sign}
            <span className="text-dsmuted/70 text-[0.75em]">$</span>
            {NBSP + numberText}
        </>
    )

    const len = plainText.length
    if (len <= 7) return content
    const scale = len <= 8 ? 0.88 : len <= 9 ? 0.8 : 0.72
    return <span style={{ fontSize: `${scale}em` }}>{content}</span>
}
