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

/** Un único input compacto, sin label visible propio: `layout: 'inline'` en el
 *  registro hace que viva en la MISMA fila que el selector de acción, así que "%
 *  de descuento" repetiría lo que ya dice "Descuento" ahí al lado — queda solo como
 *  aria-label, para accesibilidad y para los tests que buscan por label. */
export function EditorDescuento({ value, onChange }: EditorDescuentoProps) {
    const pct = value?.pct ?? 0

    return (
        <div className="flex w-[74px] shrink-0 items-center gap-1 rounded-lg border border-[#E1E6F0] bg-white px-2 py-2">
            <input
                aria-label="% de descuento"
                value={pct || ''}
                onChange={e =>
                    onChange({
                        pct: e.target.value === '' ? 0 : Number(e.target.value.replace(/[^0-9.]/g, '')),
                    })
                }
                inputMode="decimal"
                placeholder="0"
                className="w-full min-w-0 bg-transparent text-right text-sm font-extrabold text-dsnavy outline-none"
            />
            <span className="text-[13px] font-extrabold text-dsnavy">%</span>
        </div>
    )
}
