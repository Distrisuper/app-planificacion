import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem } from '@/types/planificacion'

interface MarcaOfrecimientoPickerProps {
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    value: string | null
    onChange: (marca: string | null) => void
}

/** "¿De qué marca?": la marca puntual de este rubro, independiente de si hubo o no
 *  acción comercial — el vendedor suele cargar lo más específico que sabe ("SKF"), pero
 *  si no lo sabe, alcanza con el rubro solo ("amortiguadores"). Colapsado por defecto y
 *  opcional. */
export default function MarcaOfrecimientoPicker({
    marcas,
    marcasLoading,
    value,
    onChange,
}: MarcaOfrecimientoPickerProps) {
    const [abierto, setAbierto] = useState(!!value)
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)

    if (!abierto && !value) {
        return (
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="mb-3 flex w-full items-center gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#8A93A6]">
                    ¿De qué marca?
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
            </button>
        )
    }

    return (
        <div className="animate-panel-in mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Marca
            </span>
            <button
                type="button"
                aria-label="Marca"
                onClick={() => setBuscadorAbierto(!buscadorAbierto)}
                className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
            >
                <span
                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                        value ? 'text-[#182645]' : 'text-[#8A93A6]'
                    }`}
                >
                    {value ?? 'Elegí una marca'}
                </span>
                {value && <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />}
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                        buscadorAbierto ? 'rotate-180' : ''
                    }`}
                    strokeWidth={2.4}
                />
            </button>
            {buscadorAbierto && (
                <div className="animate-panel-in mt-1.5">
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
                    />
                </div>
            )}
        </div>
    )
}
