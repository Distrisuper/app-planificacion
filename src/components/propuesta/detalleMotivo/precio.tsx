import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from '../CatalogoPicker'
import { pctVsCompetidor, type IPropsEditorMotivo } from './validadores'
import { useCampoNumero } from './numero'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Precio: contra qué marca, contra quién, y a cuánto cada uno. El % NO se tipea — se deriva
 *  de los dos precios, así queda el dato completo y no solo el delta. */
export function EditorPrecio({ valores, onChange, marcas, marcasLoading }: IPropsEditorMotivo) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)
    const pct = pctVsCompetidor(valores)
    const [textoPrecioCompetidor, onChangePrecioCompetidor] = useCampoNumero(
        valores.precio_competidor as number | null,
        precio_competidor => onChange({ precio_competidor }),
    )
    const [textoMiPrecio, onChangeMiPrecio] = useCampoNumero(
        valores.mi_precio as number | null,
        mi_precio => onChange({ mi_precio }),
    )

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
                <span className={LABEL}>Marca</span>
                {buscadorAbierto ? (
                    <CatalogoPicker
                        items={marcas}
                        loading={marcasLoading}
                        value={(valores.marca as string) ?? null}
                        onSelect={item => {
                            onChange({ marca: item.description })
                            setBuscadorAbierto(false)
                        }}
                        placeholder="Buscar marca…"
                        autoFocus
                        ocultarContadorRestantes
                    />
                ) : (
                    <button
                        type="button"
                        aria-label="Marca"
                        onClick={() => setBuscadorAbierto(true)}
                        className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                    >
                        <span
                            className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                valores.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                            }`}
                        >
                            {(valores.marca as string) ?? 'Elegí una marca'}
                        </span>
                        {valores.marca && (
                            <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                        )}
                        <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </button>
                )}
            </div>

            <label className="flex flex-col gap-1">
                <span className={LABEL}>Nombre del competidor</span>
                <input
                    value={(valores.competidor as string) ?? ''}
                    onChange={e => onChange({ competidor: e.target.value })}
                    placeholder="Ej. Corven"
                    className={INPUT}
                />
            </label>

            <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={LABEL}>Precio del competidor</span>
                    <input
                        value={textoPrecioCompetidor}
                        onChange={e => onChangePrecioCompetidor(e.target.value)}
                        inputMode="decimal"
                        className={INPUT}
                    />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={LABEL}>Mi precio</span>
                    <input
                        value={textoMiPrecio}
                        onChange={e => onChangeMiPrecio(e.target.value)}
                        inputMode="decimal"
                        className={INPUT}
                    />
                </label>
            </div>

            {/* Verde cuando somos más baratos, ámbar cuando no: el vendedor tiene que ver de
             *  qué lado está parado ANTES de ofrecer, no después. */}
            {pct !== null && (
                <p
                    className={`rounded-[10px] px-3 py-2 text-center text-[12.5px] font-bold ${
                        pct <= 0 ? 'bg-[#EAFBF1] text-[#047857]' : 'bg-[#FEF9E8] text-[#B45309]'
                    }`}
                >
                    {pct.toFixed(1)}% más {pct <= 0 ? 'barato' : 'caro'} que el competidor
                </p>
            )}
        </div>
    )
}
