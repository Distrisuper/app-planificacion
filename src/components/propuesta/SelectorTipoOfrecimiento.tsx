export type TipoOfrecible = 'rubro' | 'marca' | 'accion'

/** Subconjunto de TipoOfrecimiento a propósito: `linea` y `articulo` existen en el enum del
 *  backend pero no tienen catálogo verificado, así que no se ofrecen todavía. Cuando
 *  aparezca la fuente se agregan acá. */
const TIPOS: { valor: TipoOfrecible; label: string }[] = [
    { valor: 'rubro', label: 'Rubro' },
    { valor: 'marca', label: 'Marca' },
    { valor: 'accion', label: 'Acción' },
]

interface SelectorTipoOfrecimientoProps {
    value: TipoOfrecible
    onChange: (tipo: TipoOfrecible) => void
}

export default function SelectorTipoOfrecimiento({ value, onChange }: SelectorTipoOfrecimientoProps) {
    return (
        <div className="mb-2 flex gap-1.5">
            {TIPOS.map(t => {
                const on = value === t.valor
                return (
                    <button
                        key={t.valor}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(t.valor)}
                        className={`flex-1 rounded-[11px] border-[1.5px] px-3 py-2 text-sm font-bold ${
                            on
                                ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                : 'border-[#E4E8F0] bg-white text-[#3B4560]'
                        }`}
                    >
                        {t.label}
                    </button>
                )
            })}
        </div>
    )
}
