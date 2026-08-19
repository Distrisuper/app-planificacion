import { pctFleteSobreCompra, type IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

function aNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '')
    return limpio === '' ? null : Number(limpio)
}

/** Flete: cuánto cuesta contra cuánto se compraría. El % es el argumento de venta —
 *  "$60.000 de flete" no dice nada solo; "el 2% de la compra" sí. */
export function EditorFlete({ valores, onChange }: IPropsEditorMotivo) {
    const pct = pctFleteSobreCompra(valores)

    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Valor del flete</span>
                <input
                    value={(valores.valor_flete as number) ?? ''}
                    onChange={e => onChange({ valor_flete: aNumero(e.target.value) })}
                    inputMode="decimal"
                    className={INPUT}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Compra en $ a futuro</span>
                <input
                    value={(valores.compra_futuro as number) ?? ''}
                    onChange={e => onChange({ compra_futuro: aNumero(e.target.value) })}
                    inputMode="decimal"
                    className={INPUT}
                />
            </label>
            {pct !== null && (
                <p className="rounded-[10px] bg-[#FEF9E8] px-3 py-2 text-center text-[12.5px] font-bold text-[#B45309]">
                    El flete representa el {pct.toFixed(1)}% de la compra
                </p>
            )}
        </div>
    )
}
