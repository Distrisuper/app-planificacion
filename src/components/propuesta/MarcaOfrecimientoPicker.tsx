import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem } from '@/types/planificacion'

interface MarcaOfrecimientoPickerProps {
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    value: string | null
    onChange: (marca: string | null) => void
    /** Cuántos rubros quedan por resolver además de este. 0 = no se ofrece el check de
     *  "aplicar a restantes". */
    rubrosRestantes?: number
    /** Copia esta marca a los rubros restantes — una sola vez, al tildar el check. La
     *  acción de cada rubro no se toca. */
    onAplicarATodos?: () => void
}

/** "Marca": la marca puntual de este rubro, independiente de si hubo o no acción
 *  comercial — el vendedor suele cargar lo más específico que sabe ("SKF"), pero si no
 *  lo sabe, alcanza con el rubro solo ("amortiguadores").
 *
 *  El campo está siempre a la vista, con "Sin marca" como valor por defecto: esconderlo
 *  detrás de un "¿De qué marca?" plegado hacía que el vendedor no supiera que existía.
 *  Es un solo control (un select buscador): el disparador se REEMPLAZA por el buscador
 *  al abrirlo, en vez de sumarse arriba — así el bloque no ocupa el doble de alto. */
export default function MarcaOfrecimientoPicker({
    marcas,
    marcasLoading,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarATodos,
}: MarcaOfrecimientoPickerProps) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)
    const [aplicado, setAplicado] = useState(false)

    return (
        <div
            className={`mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] bg-white p-2.5 ${
                value ? 'border-[#B9CCEC]' : 'border-[#E4E8F0]'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                    Marca <span className="normal-case">(opcional)</span>
                </span>
                {value && rubrosRestantes > 0 && (
                    <label className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-dsnavy">
                        <input
                            type="checkbox"
                            checked={aplicado}
                            onChange={e => {
                                setAplicado(e.target.checked)
                                if (e.target.checked) onAplicarATodos?.()
                            }}
                            className="h-3.5 w-3.5 shrink-0 rounded border-[#C9D2E3] accent-dsnavy"
                        />
                        Aplicar a restantes
                    </label>
                )}
            </div>

            {buscadorAbierto ? (
                <div className="animate-panel-in">
                    <CatalogoPicker
                        items={marcas}
                        loading={marcasLoading}
                        value={value}
                        onSelect={item => {
                            onChange(item.description)
                            setBuscadorAbierto(false)
                        }}
                        placeholder="Buscar marca…"
                        autoFocus
                        opcionVacia={{
                            label: 'Sin marca',
                            onSelect: () => {
                                onChange(null)
                                setBuscadorAbierto(false)
                            },
                        }}
                        ocultarContadorRestantes
                    />
                </div>
            ) : (
                <button
                    type="button"
                    aria-label="Marca del ofrecimiento"
                    onClick={() => setBuscadorAbierto(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                >
                    <span
                        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                            value ? 'text-[#182645]' : 'text-[#8A93A6]'
                        }`}
                    >
                        {value ?? 'Sin marca'}
                    </span>
                    {value && <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />}
                    <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                </button>
            )}
        </div>
    )
}
