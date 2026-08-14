import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import AlcanceBuscador from './AlcanceBuscador'
import { resumenAlcance, toggleAlcance } from '@/lib/alcance'
import type { IAlcance, ICatalogoItem } from '@/types/planificacion'

interface AlcancePickerProps {
    value: IAlcance[]
    onChange: (alcance: IAlcance[]) => void
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
    /** true = arranca ya expandido. Lo usa AgregarOfrecimientoSheet apenas se elige
     *  una acción: ahorra el toque de abrir "Para" cuando el paso siguiente casi
     *  siempre es acotar. No es una propiedad del componente en general — cada
     *  llamador decide cuándo tiene sentido, sin que el catálogo de acciones tenga
     *  que declarar nada. */
    abrirPorDefecto?: boolean
}

/**
 * "Para…": sobre qué aplica la oferta. Opcional y colapsado por defecto, porque la
 * mayoría de las ofertas son globales y el vendedor está parado en un mostrador.
 * "Para" en vez de "Acotar a": completa la frase como la dice el vendedor
 * ("Descuento... para Bujes de SKF..."), sin jerga técnica.
 *
 * Lista vacía se muestra como "Todo el cliente" y NO como "sin alcance": lo segundo se
 * leería como que falta cargar algo.
 *
 * El buscador de adentro (`AlcanceBuscador`) mezcla marca y rubro en una sola lista, sin
 * pestañas: el caso real ("AG bujes 5%") casi siempre combina los dos, y elegir pestaña
 * antes de buscar era el paso que más costaba.
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
    abrirPorDefecto,
}: AlcancePickerProps) {
    const [abierto, setAbierto] = useState(!!abrirPorDefecto)

    return (
        <div className="mt-2 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
            <button
                type="button"
                onClick={() => setAbierto(!abierto)}
                className="flex w-full items-center gap-2 text-left"
            >
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                    Para
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
                    <AlcanceBuscador
                        marcas={marcas}
                        rubros={rubros}
                        marcasLoading={marcasLoading}
                        onSelect={destino => onChange(toggleAlcance(value, destino))}
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
