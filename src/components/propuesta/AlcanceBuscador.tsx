import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { ICatalogoItem, TipoAlcance } from '@/types/planificacion'

/** Mismo tope que CatalogoPicker: nadie scrollea cientos de opciones, se busca. */
const TOPE = 50

/** Sin acentos ni mayúsculas: nadie tipea la tilde parado en un mostrador. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

interface Resultado {
    tipo: TipoAlcance
    code: string
    description: string
}

const TIPO_ALCANCE_LABEL: Record<TipoAlcance, string> = {
    rubro: 'Rubro',
    marca: 'Marca',
    linea: 'Línea',
    articulo: 'Artículo',
}

interface AlcanceBuscadorProps {
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
    onSelect: (destino: { tipo: TipoAlcance; codigo: string; descripcion: string }) => void
}

/** Buscador único sobre marca + rubro mezclados, con un tag de tipo por resultado — sin
 *  pestañas. Antes había que elegir pestaña Marca, buscar, tocar, cambiar a pestaña
 *  Rubro, buscar, tocar: dos búsquedas separadas para algo que el vendedor dice en una
 *  sola frase ("AG bujes 5%"). No conoce el conjunto ya elegido ni lo toggle: eso lo
 *  decide AlcancePicker, que es quien mantiene `value`. */
export default function AlcanceBuscador({
    marcas,
    rubros,
    marcasLoading,
    onSelect,
}: AlcanceBuscadorProps) {
    const [busqueda, setBusqueda] = useState('')

    const combinados: Resultado[] = [
        ...marcas.map(m => ({ tipo: 'marca' as const, ...m })),
        ...rubros.map(r => ({ tipo: 'rubro' as const, ...r })),
    ]

    const q = normalizar(busqueda.trim())
    const filtrados = combinados.filter(i => q === '' || normalizar(i.description).includes(q))
    const visibles = filtrados.slice(0, TOPE)
    const ocultos = filtrados.length - visibles.length

    return (
        <div>
            <div className="relative mb-2">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                    strokeWidth={2.4}
                />
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar marca o rubro…"
                    className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                />
            </div>

            {marcasLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                    Cargando…
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <div className="flex max-h-[min(200px,26dvh)] flex-col gap-1.5 overflow-y-auto pr-0.5">
                        {visibles.map(item => (
                            <button
                                key={`${item.tipo}:${item.code}`}
                                type="button"
                                onClick={() =>
                                    onSelect({
                                        tipo: item.tipo,
                                        codigo: item.code,
                                        descripcion: item.description,
                                    })
                                }
                                className="flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left font-sans"
                            >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                    {item.description}
                                </span>
                                <span className="shrink-0 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[10px] font-bold text-[#213D82]">
                                    {TIPO_ALCANCE_LABEL[item.tipo]}
                                </span>
                            </button>
                        ))}

                        {visibles.length === 0 && (
                            <div className="py-6 text-center text-sm text-dsmuted">
                                Sin resultados
                            </div>
                        )}
                    </div>

                    {ocultos > 0 && (
                        <div className="py-2 text-center text-[12px] font-semibold text-dsmuted">
                            +{ocultos} más. Seguí escribiendo para afinar.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
