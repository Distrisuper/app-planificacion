import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Números alineados y del mismo ancho en todas las tablas de la pestaña. */
export const CLASE_NUM = 'tabular-nums lining-nums slashed-zero'

export function Tarjeta({
    titulo,
    subtitulo,
    derecha,
    children,
    className,
}: {
    titulo: string
    subtitulo?: ReactNode
    derecha?: ReactNode
    children: ReactNode
    className?: string
}) {
    return (
        <section className={cn('flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm', className)}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-dsnavytext">{titulo}</h2>
                    {subtitulo && <div className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</div>}
                </div>
                {derecha && <div className="flex shrink-0 flex-wrap items-center gap-2">{derecha}</div>}
            </div>
            {children}
        </section>
    )
}

/** Botonera de opciones excluyentes (U | $ | SR, Actual | PROY, tipo de persona). */
export function Segmentado<T extends string>({
    opciones,
    valor,
    onCambiar,
    etiqueta,
}: {
    opciones: { valor: T; etiqueta: string; titulo?: string }[]
    valor: T
    onCambiar: (v: T) => void
    etiqueta: string
}) {
    return (
        <div role="group" aria-label={etiqueta} className="inline-flex rounded-xl bg-slate-100 p-1">
            {opciones.map(o => (
                <button
                    key={o.valor}
                    type="button"
                    title={o.titulo}
                    aria-pressed={valor === o.valor}
                    onClick={() => onCambiar(o.valor)}
                    className={cn(
                        'h-8 rounded-lg px-3 text-xs font-bold transition-colors',
                        valor === o.valor ? 'bg-dsnavy text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
                    )}
                >
                    {o.etiqueta}
                </button>
            ))}
        </div>
    )
}

export function Kpi({ titulo, valor, pie, tono }: { titulo: string; valor: string; pie?: string; tono?: string }) {
    return (
        <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className={cn(CLASE_NUM, 'mt-1 text-2xl font-bold text-dsnavytext', tono)}>{valor}</p>
            {pie && <p className="mt-0.5 text-xs text-slate-500">{pie}</p>}
        </div>
    )
}

export const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => (
    <p className="py-8 text-center text-sm text-slate-500">{texto}</p>
)

export const ErrorBloque = ({ texto, onReintentar }: { texto: string; onReintentar: () => void }) => (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
        <p className="text-sm text-red-700">{texto}</p>
        <button type="button" onClick={onReintentar} className="text-sm font-semibold text-red-700 underline">
            Volver a intentar
        </button>
    </div>
)

export type Orden<C extends string> = { columna: C; dir: 'asc' | 'desc' }

/** Orden de tabla: tocar la misma columna invierte; una columna nueva arranca descendente
 *  (en un ranking lo primero que se busca es el más alto). */
export function useOrden<C extends string>(inicial: Orden<C>) {
    const [orden, setOrden] = useState(inicial)
    const ordenarPor = (columna: C) =>
        setOrden(o => (o.columna === columna ? { columna, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { columna, dir: 'desc' }))
    return { orden, ordenarPor, setOrden }
}

/** Compara dos valores de columna: null (s/d) siempre al final, en cualquier sentido. */
export function comparar(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc'): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    const r = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : (a as number) - (b as number)
    return dir === 'desc' ? -r : r
}

export function Encabezado<C extends string>({
    columna,
    orden,
    onOrdenar,
    children,
    alinear = 'right',
    className,
}: {
    columna: C
    orden: Orden<C>
    onOrdenar: (c: C) => void
    children: ReactNode
    alinear?: 'left' | 'right'
    className?: string
}) {
    const activa = orden.columna === columna
    const Icono = !activa ? ArrowUpDown : orden.dir === 'desc' ? ArrowDown : ArrowUp
    return (
        <th
            scope="col"
            aria-sort={activa ? (orden.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
            className={cn('px-3 py-2.5 font-semibold', alinear === 'right' ? 'text-right' : 'text-left', className)}
        >
            <button
                type="button"
                onClick={() => onOrdenar(columna)}
                className={cn(
                    'inline-flex items-center gap-1 text-[11px] uppercase tracking-wide',
                    activa ? 'text-dsnavytext' : 'text-slate-500 hover:text-slate-700',
                )}
            >
                {children}
                <Icono className={cn('h-3 w-3', activa ? 'opacity-100' : 'opacity-40')} aria-hidden />
            </button>
        </th>
    )
}
