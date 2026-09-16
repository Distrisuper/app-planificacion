import { useMemo, useState } from 'react'
import { Percent } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { esSuscriptor, listaDescuentos } from '@/lib/descuentosMarca'
import type { IVisitClientCard } from '@/types/planificacion'

/**
 * La puerta al sheet, en la línea de identidad del header. Compartida por `PropuestaSheet`
 * (antes de entrar, cuando el vendedor decide qué ofrecer) y `VisitaSheet` (adentro, y
 * también con la visita ya cerrada: es consulta, no edición).
 *
 * NO va en la fila de `AccionesExternas`: esos chips llevan afuera de la app y lo dicen
 * con el ↗. Éste abre contenido propio, y mezclarlos le saca al ↗ su significado.
 *
 * El sheet que abre se monta en la raíz de cada pantalla, no al lado de este botón: el
 * panel del `BottomSheet` que lo contiene se anima con `transform`, y un ancestro con
 * transform se vuelve el bloque contenedor de sus descendientes `fixed` — el overlay del
 * sheet anidado quedaría encerrado dentro del header.
 */
export function ChipDescuentos({ onAbrir }: { onAbrir: () => void }) {
    return (
        <button
            type="button"
            onClick={onAbrir}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[11px] font-bold text-violet-700"
        >
            <Percent className="h-[12px] w-[12px]" strokeWidth={2.6} />
            Descuentos
        </button>
    )
}

/** Sin acentos ni mayúsculas: nadie tipea la tilde parado en un mostrador (mismo criterio
 *  que `CatalogoPicker` y el buscador de `OfrecimientoTable`). */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
}

const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold'

function ChipEscalar({ label, valor }: { label: string; valor?: number | null }) {
    if (valor == null || valor <= 0) return null
    return (
        <span className={`${CHIP} bg-[#F1F4F9] text-dsnavytext`}>
            {label} {Math.round(valor)}%
        </span>
    )
}

/**
 * La ficha de descuentos del cliente, completa — no sólo las marcas del rubro abierto.
 * Es de consulta: no hay nada tocable adentro.
 *
 * El buscador filtra un array en memoria, así que NO usa `useTextoDebounced`: ese hook
 * existe para los buscadores de cartera, que disparan una request por tecla. Acá sólo
 * agregaría 300ms de lag a un filtro gratis.
 */
export default function DescuentosMarcaSheet({
    open,
    onClose,
    cliente,
}: {
    open: boolean
    onClose: () => void
    cliente: IVisitClientCard
}) {
    const [busqueda, setBusqueda] = useState('')
    const suscriptor = esSuscriptor(cliente)
    const todos = useMemo(() => listaDescuentos(cliente), [cliente])

    const visibles = useMemo(() => {
        const q = normalizar(busqueda.trim())
        if (!q) return todos
        return todos.filter(d => normalizar(d.nombre).includes(q))
    }, [todos, busqueda])

    return (
        <BottomSheet open={open} onClose={onClose} title="Descuentos por marca">
            <div className="mb-3 flex flex-wrap gap-1.5">
                {/* El chip SUSCRIPTOR REEMPLAZA al de Bonif.: son el mismo número
                    (`bonusDiscount`), y mostrarlo dos veces sugiere dos beneficios
                    distintos. El de GM sí convive, porque es otro eje — `gm_discount`
                    sale del texto del barrio y es un camino de precio excluyente. */}
                {suscriptor ? (
                    <span className={`${CHIP} bg-violet-50 text-violet-700 ring-1 ring-violet-200`}>
                        SUSCRIPTOR · {Math.round(Number(cliente.bonusDiscount))}%
                    </span>
                ) : (
                    <ChipEscalar label="Bonif." valor={cliente.bonusDiscount} />
                )}
                <ChipEscalar label="GM" valor={cliente.gmDiscount} />
                {/* En la práctica nunca se dibuja: `general_discount` vale 0 para todos
                    porque dbt lee `discounts->>'byGeneral'` y client-service nunca emite
                    esa clave (spec §3.2). Se deja para que el día que arreglen el ETL
                    aparezca solo, sin tocar esta pantalla. */}
                <ChipEscalar label="Gral." valor={cliente.generalDiscount} />
            </div>

            {suscriptor ? (
                <p className="text-[12.5px] font-semibold leading-snug text-dsmuted">
                    El {Math.round(Number(cliente.bonusDiscount))}% ya aplica a todo. Los
                    descuentos por marca no se suman.
                </p>
            ) : todos.length === 0 ? (
                <p className="text-[12.5px] font-semibold leading-snug text-dsmuted">
                    Este cliente no tiene descuentos por marca.
                </p>
            ) : (
                <>
                    <input
                        type="search"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar marca…"
                        className="mb-2 w-full rounded-md border border-[#E4E8F0] bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-dsnavytext outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                    />
                    {visibles.length === 0 ? (
                        <p className="text-[12.5px] font-semibold text-dsmuted">
                            Ninguna marca coincide con la búsqueda.
                        </p>
                    ) : (
                        <ul className="divide-y divide-dsline">
                            {visibles.map(d => (
                                <li
                                    key={d.code}
                                    className="flex items-center gap-2 py-2 text-[12.5px] font-semibold text-dsnavytext"
                                >
                                    <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
                                    <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px text-[11px] font-bold tabular-nums text-violet-700">
                                        {Math.round(d.valor)}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </BottomSheet>
    )
}
