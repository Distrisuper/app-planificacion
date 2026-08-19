import { pctFleteSobreCompra, type IPropsEditorMotivo } from './validadores'
import { useCampoNumero } from './numero'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Flete: cuánto cuesta contra cuánto se compraría. El % es el argumento de venta —
 *  "$60.000 de flete" no dice nada solo; "el 2% de la compra" sí. */
export function EditorFlete({ valores, onChange }: IPropsEditorMotivo) {
    const pct = pctFleteSobreCompra(valores)
    const [textoValorFlete, onChangeValorFlete] = useCampoNumero(
        valores.valor_flete as number | null,
        valor_flete => onChange({ valor_flete }),
    )
    const [textoCompraFuturo, onChangeCompraFuturo] = useCampoNumero(
        valores.compra_futuro as number | null,
        compra_futuro => onChange({ compra_futuro }),
    )

    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Valor del flete</span>
                <input
                    value={textoValorFlete}
                    onChange={e => onChangeValorFlete(e.target.value)}
                    inputMode="decimal"
                    className={INPUT}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Compra en $ a futuro</span>
                <input
                    value={textoCompraFuturo}
                    onChange={e => onChangeCompraFuturo(e.target.value)}
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
