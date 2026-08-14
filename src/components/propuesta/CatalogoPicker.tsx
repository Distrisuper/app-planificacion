import { useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import type { ICatalogoItem } from '@/types/planificacion'

/** Los catálogos traen cientos de filas (el de marcas sale de 12 meses de ventas).
 *  Pintarlas todas en un sheet en un teléfono de gama baja se siente lento, y nadie
 *  scrollea 400 opciones: se busca. */
const TOPE = 50

interface CatalogoPickerProps {
    items: ICatalogoItem[]
    loading?: boolean
    /** Codes que no se ofrecen (ej. rubros ya en la visita). */
    excluir?: string[]
    /** Descripción del ítem ya elegido, para marcarlo con un tilde. Se compara por
     *  `description` y no por `code` porque es lo que persiste la columna `marca`:
     *  de un valor viejo en texto libre no hay code que buscar. */
    value?: string | null
    /** Code del ítem cuya mutación está en vuelo: esa fila muestra spinner y el resto
     *  de la lista queda deshabilitada. */
    pendingCode?: string | null
    onSelect: (item: ICatalogoItem) => void
    placeholder: string
    autoFocus?: boolean
    /** Opción de "ninguno" como PRIMERA fila de la lista (ej. "Sin marca"). Va adentro
     *  de la lista y no como chip aparte arriba: afuera duplicaba la altura del control
     *  y quedaba lejos del lugar donde se elige. Queda marcada cuando `value` es null. */
    opcionVacia?: { label: string; onSelect: () => void }
    /** Oculta el "+N más. Seguí escribiendo…" del pie. En un combo chico (marca dentro
     *  del rubro) el cartel no aporta: el buscador ya está a la vista. */
    ocultarContadorRestantes?: boolean
}

/** Sin acentos ni mayúsculas: nadie tipea la tilde de "BATERÍAS" parado en un mostrador. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

/** Lista buscable sobre un catálogo. No sabe qué catálogo muestra ni de dónde sale:
 *  lo usan tanto el alta de rubros (como vista del sheet) como el campo Marca del
 *  detalle de motivo (inline). */
export default function CatalogoPicker({
    items,
    loading,
    excluir,
    value,
    pendingCode,
    onSelect,
    placeholder,
    autoFocus,
    opcionVacia,
    ocultarContadorRestantes,
}: CatalogoPickerProps) {
    const [busqueda, setBusqueda] = useState('')

    // Sin useMemo a propósito: `excluir` suele llegar como array literal, así que la
    // memo se invalidaría en cada render igual. Filtrar unos cientos de strings es
    // más barato que la ilusión de estar cacheando.
    const fuera = new Set(excluir ?? [])
    const q = normalizar(busqueda.trim())
    const filtrados = items.filter(
        i => !fuera.has(i.code) && (q === '' || normalizar(i.description).includes(q)),
    )
    const visibles = filtrados.slice(0, TOPE)
    const ocultos = filtrados.length - visibles.length

    // Un valor guardado que ya no está en el catálogo (marca vieja en texto libre, o
    // marca que dejó de vender y cayó de los 12 meses) se muestra igual, inerte:
    // perderlo en silencio sería peor que la inconsistencia que esto viene a arreglar.
    const huerfano = value && !items.some(i => i.description === value) ? value : null

    const bloqueada = pendingCode != null

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
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                />
            </div>

            {huerfano && (
                <div className="mb-2 flex items-center gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-[#EEF3FB] px-3 py-2.5">
                    <Check className="h-[15px] w-[15px] shrink-0 text-[#213D82]" strokeWidth={3} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#182645]">
                        {huerfano}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-dsmuted">
                        fuera de catálogo
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                    Cargando…
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {/* Alto acotado con scroll propio: sin esto, una lista larga (el
                     *  catálogo de marcas trae cientos) estira el contenedor que lo
                     *  monta. Montado inline en el detalle de un motivo, eso empuja el
                     *  resto del wizard fuera de vista en vez de scrollear en su lugar.
                     *  `min(200px, 26dvh)` en vez de un fijo: en una pantalla chica (o
                     *  con el teclado virtual abierto) un alto fijo puede ser más de lo
                     *  que queda visible del sheet; así se achica solo en vez de forzar
                     *  un segundo scroll para ver el pie (Atrás/Finalizar). */}
                    <div className="flex max-h-[min(200px,26dvh)] flex-col gap-1.5 overflow-y-auto pr-0.5">
                        {opcionVacia && (
                            <button
                                type="button"
                                disabled={bloqueada}
                                onClick={opcionVacia.onSelect}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans disabled:opacity-50 ${
                                    value ? 'border-[#E4E8F0] bg-white' : 'border-[#B9CCEC] bg-[#EEF3FB]'
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                    {opcionVacia.label}
                                </span>
                                {!value && (
                                    <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                                )}
                            </button>
                        )}
                        {visibles.map(item => {
                            const enCurso = pendingCode === item.code
                            const elegido = value === item.description
                            return (
                                <button
                                    key={item.code}
                                    type="button"
                                    disabled={bloqueada}
                                    aria-busy={enCurso}
                                    onClick={() => onSelect(item)}
                                    className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans disabled:opacity-50 ${
                                        elegido
                                            ? 'border-[#B9CCEC] bg-[#EEF3FB]'
                                            : 'border-[#E4E8F0] bg-white'
                                    }`}
                                >
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                        {item.description}
                                    </span>
                                    {enCurso && (
                                        <Loader2
                                            className="h-4 w-4 shrink-0 animate-spin text-dsmuted"
                                            strokeWidth={2.4}
                                        />
                                    )}
                                    {!enCurso && elegido && (
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

                    {ocultos > 0 && !ocultarContadorRestantes && (
                        <div className="py-2 text-center text-[12px] font-semibold text-dsmuted">
                            +{ocultos} más. Seguí escribiendo para afinar.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
