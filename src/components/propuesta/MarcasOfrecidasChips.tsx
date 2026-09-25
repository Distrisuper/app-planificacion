import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import { lineaDeMarca } from '@/lib/marcaOfrecida'
import type { ICatalogoItem, IMarcaEstado, IMarcaOfrecida } from '@/types/planificacion'

interface MarcasOfrecidasChipsProps {
    /** Las marcas que el cliente compra en este rubro (el mismo desglose de la tabla). */
    marcasDelRubro: IMarcaEstado[]
    /** Catálogo completo, para "+ Otra". */
    catalogo: ICatalogoItem[]
    catalogoLoading?: boolean
    /** Rubro que se está resolviendo: define qué línea de la marca se guarda al elegirla
     *  en "+ Otra". `null` si el ofrecimiento no es de un rubro. */
    rubroCode: string | null
    value: IMarcaOfrecida[]
    onChange: (marcas: IMarcaOfrecida[]) => void
    /** Cuántos rubros quedan además de este. 0 = no se ofrece "Aplicar a restantes". */
    rubrosRestantes?: number
    /** Copia las marcas tildadas a los rubros restantes sin marcas — una sola vez. */
    onAplicarATodos?: () => void
}

/** "¿Qué marca ofreciste?" — chips multi-selección precargados con el desglose del rubro
 *  (spec 2026-09-16 §5.2). Reemplaza al select de una sola marca que escribía
 *  `detalle.marca`: lo que se elige acá va al alcance del ofrecimiento (tipo='marca').
 *  Opcional: nunca bloquea nada.
 *
 *  La identidad de una marca es su NOMBRE, no su código: el código es una línea de la
 *  marca (SKF vende bajo ~14), y el mismo SKF puede llegar con una línea en el chip y con
 *  otra desde el catálogo. Comparando por código, SKF tildada como chip seguía en "+ Otra"
 *  y elegirla ahí sumaba un segundo chip "SKF". El código que se guarda lo decide
 *  `lineaDeMarca`: la línea de la marca en ESTE rubro. */
export default function MarcasOfrecidasChips({
    marcasDelRubro,
    catalogo,
    catalogoLoading,
    rubroCode,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarATodos,
}: MarcasOfrecidasChipsProps) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)
    const [aplicado, setAplicado] = useState(false)

    const elegidas = new Set(value.map(m => m.descripcion))
    // Un chip por marca: si el cliente compra dos líneas de SKF en el rubro, el desglose
    // trae dos filas "SKF", y para esta pregunta son la misma marca.
    const chips = marcasDelRubro.filter((m, i) => marcasDelRubro.findIndex(d => d.nombre === m.nombre) === i)
    // Chips = desglose del rubro + las elegidas que no están en el desglose (vinieron de
    // "+ Otra" o de un alcance guardado), para que lo elegido siempre se vea.
    const extras = value.filter(m => !chips.some(d => d.nombre === m.descripcion))

    function toggle(codigo: string, descripcion: string) {
        if (elegidas.has(descripcion)) onChange(value.filter(m => m.descripcion !== descripcion))
        else onChange([...value, { codigo, descripcion }])
    }

    return (
        <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                    ¿Qué marca ofreciste? <span className="normal-case tracking-normal font-semibold">· opcional</span>
                </span>
                {value.length > 0 && rubrosRestantes > 0 && (
                    <label className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-dsnavy">
                        <input
                            type="checkbox"
                            aria-label="Aplicar a restantes"
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

            <div className="flex flex-wrap gap-1.5">
                {chips.map(m => {
                    const on = elegidas.has(m.nombre)
                    return (
                        <button
                            key={m.code}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(m.code, m.nombre)}
                            className={`flex min-h-[32px] items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] font-bold ${
                                on ? 'border-dsnavy bg-[#EEF3FB] text-dsnavy' : 'border-[#C9D2E3] bg-white text-[#182645]'
                            }`}
                        >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                            {m.nombre}
                        </button>
                    )
                })}
                {extras.map(m => (
                    <button
                        key={m.codigo}
                        type="button"
                        aria-pressed
                        onClick={() => toggle(m.codigo, m.descripcion)}
                        className="flex min-h-[32px] items-center gap-1.5 rounded-full border-[1.5px] border-dsnavy bg-[#EEF3FB] px-3 text-[12px] font-bold text-dsnavy"
                    >
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {m.descripcion}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setBuscadorAbierto(v => !v)}
                    aria-expanded={buscadorAbierto}
                    className="flex min-h-[32px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-[#C9D2E3] px-3 text-[12px] font-bold text-dsmuted"
                >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    Otra
                </button>
            </div>

            {buscadorAbierto && (
                <div className="animate-panel-in mt-2">
                    <CatalogoPicker
                        items={catalogo}
                        loading={catalogoLoading}
                        excluir={catalogo.filter(i => elegidas.has(i.description)).map(i => i.code)}
                        onSelect={item => {
                            if (!elegidas.has(item.description)) {
                                onChange([
                                    ...value,
                                    lineaDeMarca(
                                        { codigo: item.code, descripcion: item.description },
                                        rubroCode,
                                        chips,
                                        catalogo,
                                    ),
                                ])
                            }
                            setBuscadorAbierto(false)
                        }}
                        placeholder="Buscar marca…"
                        autoFocus
                        ocultarContadorRestantes
                    />
                </div>
            )}
        </div>
    )
}
