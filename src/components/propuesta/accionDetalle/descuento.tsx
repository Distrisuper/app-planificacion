export interface IDescuentoDetalle {
    pct: number
}

/** Un solo campo numérico positivo: la evidencia de Cromo ("5% descuento", "3% adi")
 *  nunca trae un monto fijo, siempre un porcentaje. */
export function esValidoDescuento(detalle: IDescuentoDetalle | undefined): boolean {
    return !!detalle && detalle.pct > 0
}

export function resumenDescuento(detalle: IDescuentoDetalle): string {
    return `${detalle.pct}% descuento`
}

interface EditorDescuentoProps {
    value: IDescuentoDetalle | undefined
    onChange: (detalle: IDescuentoDetalle) => void
}

/** Mismo patrón visual que el campo `pctDiferencia` del wizard de motivos
 *  (ResolucionOfrecimiento.tsx) — un único input, sin tramos ni lista. */
export function EditorDescuento({ value, onChange }: EditorDescuentoProps) {
    const pct = value?.pct ?? 0

    return (
        <div className="mt-2 flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
            <label htmlFor="descuento-pct" className="text-[12.5px] font-bold text-[#3B4560]">
                % de descuento
            </label>
            <div className="flex flex-1 items-center justify-end gap-1">
                <input
                    id="descuento-pct"
                    value={pct || ''}
                    onChange={e =>
                        onChange({
                            pct: e.target.value === '' ? 0 : Number(e.target.value.replace(/[^0-9.]/g, '')),
                        })
                    }
                    inputMode="decimal"
                    placeholder="0"
                    className="w-16 rounded-lg border border-[#E1E6F0] px-2 py-1.5 text-right text-sm font-extrabold text-dsnavy outline-none"
                />
                <span className="text-[15px] font-extrabold text-dsnavy">%</span>
            </div>
        </div>
    )
}
