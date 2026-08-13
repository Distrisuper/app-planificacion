import { useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { ICatalogoItem } from '@/types/planificacion'

export type TipoOfrecible = 'rubro' | 'marca' | 'accion'

/** Mismo tope que CatalogoPicker/AlcanceBuscador: nadie scrollea cientos de opciones. */
const TOPE = 50

/** Sin acentos ni mayúsculas: nadie tipea la tilde parado en un mostrador. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

interface Resultado {
    tipo: TipoOfrecible
    code: string
    description: string
}

const TIPO_OFRECIBLE_LABEL: Record<TipoOfrecible, string> = {
    rubro: 'Rubro',
    marca: 'Marca',
    accion: 'Acción',
}

export interface IElegidoOfrecimiento {
    tipo: TipoOfrecible
    codigo: string
    descripcion: string
}

interface OfrecimientoBuscadorProps {
    rubros: ICatalogoItem[]
    marcas: ICatalogoItem[]
    acciones: ICatalogoItem[]
    marcasLoading?: boolean
    /** Lo ya elegido, si hay algo. */
    value?: IElegidoOfrecimiento | null
    onSelect: (item: IElegidoOfrecimiento) => void
}

/** Buscador único sobre rubro + marca + acción mezclados, con un tag de tipo por
 *  resultado — sin elegir pestaña antes de buscar. Reemplaza a SelectorTipoOfrecimiento
 *  + CatalogoPicker: antes había que decidir "¿esto es un rubro, una marca o una
 *  acción?" antes de poder escribir lo que el vendedor ya tiene en la cabeza ("SKF",
 *  "Descuento", "Bujes"). El tipo se deriva de qué catálogo trajo el resultado elegido,
 *  no de una decisión previa. Mientras `marcas` está cargando, se excluyen del
 *  combinado (no bloquea la búsqueda de rubro/acción, que ya están disponibles).
 *
 *  Elegir algo colapsa la lista a un resumen de una línea: mostrar la lista completa
 *  (hasta 50 filas con scroll) DEBAJO de "Para" (el picker de alcance) dejaba dos
 *  listas largas apiladas en pantalla a la vez — mucho scroll para algo que ya se
 *  eligió. Tocar el resumen la vuelve a expandir para cambiar la elección. */
export default function OfrecimientoBuscador({
    rubros,
    marcas,
    acciones,
    marcasLoading,
    value,
    onSelect,
}: OfrecimientoBuscadorProps) {
    const [abierto, setAbierto] = useState(!value)
    const [busqueda, setBusqueda] = useState('')

    function elegir(item: IElegidoOfrecimiento) {
        onSelect(item)
        setAbierto(false)
    }

    if (!abierto && value) {
        return (
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="animate-panel-in flex w-full items-center gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-[#EEF3FB] px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#182645]">
                    {value.descripcion}
                </span>
                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#213D82]">
                    {TIPO_OFRECIBLE_LABEL[value.tipo]}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
            </button>
        )
    }

    // Acciones primero: son pocas (hoy 4, contra cientos de rubros/marcas), así que
    // ponerlas arriba las deja siempre a la vista sin escribir nada, sin competir por
    // espacio con una lista mucho más larga que de todos modos hay que buscar.
    const combinados: Resultado[] = [
        ...acciones.map(a => ({ tipo: 'accion' as const, ...a })),
        ...rubros.map(r => ({ tipo: 'rubro' as const, ...r })),
        ...(marcasLoading ? [] : marcas.map(m => ({ tipo: 'marca' as const, ...m }))),
    ]

    const q = normalizar(busqueda.trim())
    const filtrados = combinados.filter(i => q === '' || normalizar(i.description).includes(q))
    const visibles = filtrados.slice(0, TOPE)
    const ocultos = filtrados.length - visibles.length

    return (
        <div className="animate-panel-in">
            <div className="relative mb-2">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                    strokeWidth={2.4}
                />
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar rubro, marca o acción…"
                    autoFocus
                    className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                />
            </div>

            <div className="flex flex-col gap-1.5">
                {/* Más alta que CatalogoPicker (200px/26dvh): ahí es un campo de detalle
                    metido dentro del wizard, acá es la pantalla completa del alta —
                    con solo 200px se cortaba a los 4-5 primeros resultados. */}
                <div className="flex max-h-[min(360px,50dvh)] flex-col gap-1.5 overflow-y-auto pr-0.5">
                    {visibles.map(item => {
                        const elegido = value?.tipo === item.tipo && value.codigo === item.code
                        return (
                            <button
                                key={`${item.tipo}:${item.code}`}
                                type="button"
                                onClick={() =>
                                    elegir({
                                        tipo: item.tipo,
                                        codigo: item.code,
                                        descripcion: item.description,
                                    })
                                }
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans ${
                                    elegido
                                        ? 'border-[#B9CCEC] bg-[#EEF3FB]'
                                        : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                    {item.description}
                                </span>
                                <span className="shrink-0 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[10px] font-bold text-[#213D82]">
                                    {TIPO_OFRECIBLE_LABEL[item.tipo]}
                                </span>
                                {elegido && (
                                    <Check
                                        className="h-4 w-4 shrink-0 text-[#213D82]"
                                        strokeWidth={3}
                                    />
                                )}
                            </button>
                        )
                    })}

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

                {marcasLoading && (
                    <div className="py-1 text-center text-[12px] font-semibold text-dsmuted">
                        Cargando marcas…
                    </div>
                )}
            </div>
        </div>
    )
}
