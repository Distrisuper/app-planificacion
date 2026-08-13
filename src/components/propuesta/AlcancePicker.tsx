import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import { resumenAlcance, toggleAlcance } from '@/lib/alcance'
import type { IAlcance, ICatalogoItem, TipoAlcance } from '@/types/planificacion'

interface AlcancePickerProps {
    value: IAlcance[]
    onChange: (alcance: IAlcance[]) => void
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
}

/**
 * "Acotar a…": sobre qué aplica la oferta. Opcional y colapsado por defecto, porque la
 * mayoría de las ofertas son globales y el vendedor está parado en un mostrador.
 *
 * Lista vacía se muestra como "Todo el cliente" y NO como "sin alcance": lo segundo se
 * leería como que falta cargar algo.
 *
 * UI deliberadamente mínima — el rediseño del wizard es una iteración aparte. Lo que
 * importa acá es que el dato se pueda cargar para validar el modelo con uso real.
 */
export default function AlcancePicker({
    value,
    onChange,
    marcas,
    rubros,
    marcasLoading,
}: AlcancePickerProps) {
    const [abierto, setAbierto] = useState(false)
    const [tipo, setTipo] = useState<TipoAlcance>('marca')

    const items = tipo === 'marca' ? marcas : rubros

    return (
        <div className="mt-2 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
            <button
                type="button"
                onClick={() => setAbierto(!abierto)}
                className="flex w-full items-center gap-2 text-left"
            >
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                    Acotar a
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#182645]">
                    {resumenAlcance(value)}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                        abierto ? 'rotate-180' : ''
                    }`}
                    strokeWidth={2.4}
                />
            </button>

            {abierto && (
                <div className="animate-panel-in mt-2">
                    <div className="mb-2 flex gap-1.5">
                        {(['marca', 'rubro'] as TipoAlcance[]).map(t => (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={tipo === t}
                                onClick={() => setTipo(t)}
                                className={`flex-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-bold ${
                                    tipo === t
                                        ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                        : 'border-[#E1E6F0] bg-white text-[#3B4560]'
                                }`}
                            >
                                {t === 'marca' ? 'Marcas' : 'Rubros'}
                            </button>
                        ))}
                    </div>

                    <CatalogoPicker
                        items={items}
                        loading={tipo === 'marca' ? marcasLoading : false}
                        onSelect={item =>
                            onChange(
                                toggleAlcance(value, {
                                    tipo,
                                    codigo: item.code,
                                    descripcion: item.description,
                                }),
                            )
                        }
                        placeholder={tipo === 'marca' ? 'Buscar marca…' : 'Buscar rubro…'}
                    />

                    {value.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {value.map(a => (
                                <button
                                    key={`${a.tipo}:${a.codigo}`}
                                    type="button"
                                    onClick={() => onChange(toggleAlcance(value, a))}
                                    className="rounded-full border-[1.5px] border-[#B9CCEC] bg-[#EEF3FB] px-2.5 py-1 text-[12px] font-bold text-[#182645]"
                                >
                                    {a.descripcion} ✕
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
