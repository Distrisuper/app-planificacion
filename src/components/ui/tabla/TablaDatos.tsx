import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnMeta,
    type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { coincideTexto, normalizarTexto } from '@/lib/textoTabla'
import { cn } from '@/lib/utils'

export interface TablaDatosProps<T> {
    datos: T[]
    /** Armadas con `definirColumnas` (tipos de columna), memorizadas. */
    columnas: ColumnDef<T, any>[]
    /** Id estable de la fila: si cambia un filtro de afuera, la tabla no se rearma. */
    getRowId: (fila: T) => string
    /** Nombre accesible de la tabla. */
    etiqueta: string
    /** Contador "N de M <unidad>" arriba de la tabla. */
    unidad?: { singular: string; plural: string }
    /** Buscador sin acentos sobre las columnas de texto. */
    buscar?: { placeholder: string }
    ordenInicial?: { id: string; desc: boolean }
    /** Primera columna con la posición en el orden actual (un ranking). */
    numerar?: boolean
    etiquetaTotal?: ReactNode
    onClickFila?: (fila: T) => void
    /** Qué filas abren el detalle; por defecto todas si hay `onClickFila`. */
    filaClicable?: (fila: T) => boolean
    /** `aria-label` de las filas clicables. */
    etiquetaFila?: (fila: T) => string
    /** `data-testid` de cada fila; por defecto `fila-<id>`. */
    testIdFila?: (fila: T) => string
    /** Dibuja solo las filas visibles. `true`/`false` lo fuerza; un número es el umbral de filas
     *  (por defecto 200: por debajo se dibujan todas). */
    virtualizar?: boolean | number
    mensajeVacio?: string
    className?: string
}

const ALTO_FILA = 40
const UMBRAL_VIRTUAL = 200
const ANCHO_NUMERO = 44
/** Lo mínimo que se le deja a la columna elástica antes de que la tabla scrollee en su panel. */
const MIN_ELASTICA = 160

const CLASE_ALINEAR: Record<ColumnMeta<unknown, unknown>['alinear'], string> = {
    izquierda: 'text-left',
    derecha: 'text-right tabular-nums',
    centro: 'text-center',
}

/**
 * La tabla de la app, sobre TanStack Table (modelo: orden y totales) y TanStack Virtual (dibujar
 * solo lo visible arriba de ~200 filas). Orden en todas las columnas (asc → desc → sin orden, los
 * vacíos siempre al final), búsqueda sin acentos, contador "N de M", fila de total sobre lo
 * filtrado, encabezado fijo, `table-layout: fixed` con los anchos de cada tipo y clic en la fila.
 */
export default function TablaDatos<T>({
    datos,
    columnas,
    getRowId,
    etiqueta,
    unidad,
    buscar,
    ordenInicial,
    numerar,
    etiquetaTotal = 'Total',
    onClickFila,
    filaClicable,
    etiquetaFila,
    testIdFila,
    virtualizar,
    mensajeVacio = 'No hay filas con estos filtros.',
    className,
}: TablaDatosProps<T>) {
    const [sorting, setSorting] = useState<SortingState>(ordenInicial ? [ordenInicial] : [])
    const [busqueda, setBusqueda] = useState('')
    const contenedor = useRef<HTMLDivElement>(null)

    // El texto de búsqueda de cada fila se normaliza una vez, no en cada tecla.
    const textos = useMemo(() => {
        const deBusqueda = columnas.map(c => c.meta?.textoBusqueda).filter(t => t !== undefined)
        return new Map(datos.map(f => [f, normalizarTexto(deBusqueda.map(t => t(f)).join(' '))]))
    }, [datos, columnas])
    const filtradas = useMemo(
        () => (busqueda.trim() ? datos.filter(f => coincideTexto(busqueda, textos.get(f) ?? '')) : datos),
        [datos, busqueda, textos],
    )

    const tabla = useReactTable({
        data: filtradas,
        columns: columnas,
        state: { sorting },
        onSortingChange: setSorting,
        getRowId: f => getRowId(f),
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        defaultColumn: { sortUndefined: 'last' },
    })

    const filas = tabla.getRowModel().rows
    const hojas = tabla.getVisibleLeafColumns()
    const virtual = virtualizar === true || (virtualizar !== false && filas.length > (typeof virtualizar === 'number' ? virtualizar : UMBRAL_VIRTUAL))
    const virtualizador = useVirtualizer({
        count: virtual ? filas.length : 0,
        getScrollElement: () => contenedor.current,
        estimateSize: () => ALTO_FILA,
        overscan: 8,
    })
    const items = virtualizador.getVirtualItems()
    const visibles = virtual ? items.map(i => ({ fila: filas[i.index], posicion: i.index })) : filas.map((fila, posicion) => ({ fila, posicion }))
    const rellenoArriba = virtual && items.length ? items[0].start : 0
    const rellenoAbajo = virtual && items.length ? virtualizador.getTotalSize() - items[items.length - 1].end : 0

    const totalColumnas = hojas.length + (numerar ? 1 : 0)
    const primerTotal = hojas.findIndex(c => c.columnDef.meta?.total)
    const originales = filas.map(f => f.original)
    const anchoMinimo = hojas.reduce((s, c) => s + (c.columnDef.meta?.ancho ?? MIN_ELASTICA), numerar ? ANCHO_NUMERO : 0)

    const nombreUnidad = (n: number) => (unidad ? ` ${n === 1 ? unidad.singular : unidad.plural}` : '')
    const contador =
        filtradas.length === datos.length
            ? `${datos.length}${nombreUnidad(datos.length)}`
            : `${filtradas.length} de ${datos.length}${nombreUnidad(datos.length)}`

    const clicable = (f: T) => !!onClickFila && (filaClicable?.(f) ?? true)

    return (
        <div className={cn('flex min-w-0 flex-col gap-3', className)}>
            {(buscar || unidad) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {buscar && (
                        <label className="flex h-8 w-full max-w-[280px] items-center gap-2 rounded-lg border border-linea bg-tarjeta px-2.5 focus-within:ring-2 focus-within:ring-primario">
                            <Search className="h-3.5 w-3.5 shrink-0 text-tinta-2" aria-hidden />
                            <input
                                type="search"
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder={buscar.placeholder}
                                aria-label={buscar.placeholder}
                                autoComplete="off"
                                className="w-full bg-transparent text-[13px] text-tinta outline-none placeholder:text-tinta-2"
                            />
                        </label>
                    )}
                    {unidad && <span className="text-[13px] text-tinta-2">{contador}</span>}
                </div>
            )}
            <div ref={contenedor} className="max-h-[70vh] overflow-auto rounded-lg border border-linea">
                <table aria-label={etiqueta} className="w-full table-fixed border-collapse text-[13.5px]" style={{ minWidth: anchoMinimo }}>
                    <colgroup>
                        {numerar && <col style={{ width: ANCHO_NUMERO }} />}
                        {hojas.map(c => (
                            <col key={c.id} style={c.columnDef.meta?.ancho ? { width: c.columnDef.meta.ancho } : undefined} />
                        ))}
                    </colgroup>
                    <thead className="sticky top-0 z-[1] bg-tarjeta shadow-[inset_0_-1px_0_0_rgb(var(--linea))]">
                        <tr>
                            {numerar && (
                                <th scope="col" className="h-9 px-3 text-right text-xs font-semibold text-tinta-2">
                                    #
                                </th>
                            )}
                            {tabla.getFlatHeaders().map(h => {
                                const meta = h.column.columnDef.meta
                                const orden = h.column.getIsSorted()
                                const Icono = orden === 'asc' ? ArrowUp : orden === 'desc' ? ArrowDown : ArrowUpDown
                                const alinear = meta?.alinear ?? 'izquierda'
                                return (
                                    <th
                                        key={h.id}
                                        scope="col"
                                        aria-sort={orden === 'asc' ? 'ascending' : orden === 'desc' ? 'descending' : 'none'}
                                        className={cn('h-9 px-3 text-xs font-semibold text-tinta-2', CLASE_ALINEAR[alinear])}
                                    >
                                        {h.column.getCanSort() ? (
                                            <button
                                                type="button"
                                                onClick={h.column.getToggleSortingHandler()}
                                                className={cn(
                                                    'inline-flex max-w-full items-center gap-1 rounded hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario',
                                                    alinear === 'derecha' && 'flex-row-reverse',
                                                    orden && 'text-tinta',
                                                )}
                                            >
                                                <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                                                <Icono className={cn('h-3 w-3 shrink-0', !orden && 'opacity-40')} aria-hidden />
                                            </button>
                                        ) : (
                                            flexRender(h.column.columnDef.header, h.getContext())
                                        )}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.length === 0 && (
                            <tr>
                                <td colSpan={totalColumnas} className="px-3 py-8 text-center text-[13px] text-tinta-2">
                                    {mensajeVacio}
                                </td>
                            </tr>
                        )}
                        {rellenoArriba > 0 && (
                            <tr aria-hidden>
                                <td colSpan={totalColumnas} style={{ height: rellenoArriba }} />
                            </tr>
                        )}
                        {visibles.map(({ fila, posicion }) => {
                            const f = fila.original
                            const abre = clicable(f)
                            const abrir = () => onClickFila?.(f)
                            return (
                                <tr
                                    key={fila.id}
                                    data-testid={testIdFila ? testIdFila(f) : `fila-${fila.id}`}
                                    className={cn(
                                        'h-10 border-t border-linea first:border-t-0',
                                        abre && 'cursor-pointer hover:bg-superficie focus-visible:bg-superficie focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario',
                                    )}
                                    {...(abre && {
                                        tabIndex: 0,
                                        'aria-label': etiquetaFila?.(f),
                                        onClick: abrir,
                                        onKeyDown: (e: KeyboardEvent) => {
                                            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                                            e.preventDefault()
                                            abrir()
                                        },
                                    })}
                                >
                                    {numerar && <td className="px-3 text-right text-xs tabular-nums text-tinta-2">{posicion + 1}</td>}
                                    {fila.getVisibleCells().map(celda => (
                                        <td
                                            key={celda.id}
                                            className={cn(
                                                'overflow-hidden whitespace-nowrap px-3 text-tinta',
                                                CLASE_ALINEAR[celda.column.columnDef.meta?.alinear ?? 'izquierda'],
                                            )}
                                        >
                                            {flexRender(celda.column.columnDef.cell, celda.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                        {rellenoAbajo > 0 && (
                            <tr aria-hidden>
                                <td colSpan={totalColumnas} style={{ height: rellenoAbajo }} />
                            </tr>
                        )}
                    </tbody>
                    {primerTotal >= 0 && filas.length > 0 && (
                        <tfoot className="sticky bottom-0 z-[1] bg-superficie shadow-[inset_0_1px_0_0_rgb(var(--linea))]">
                            <tr data-testid="fila-total" className="h-10 font-bold text-tinta">
                                {primerTotal + (numerar ? 1 : 0) > 0 && (
                                    <td colSpan={primerTotal + (numerar ? 1 : 0)} className="truncate px-3">
                                        {etiquetaTotal}
                                    </td>
                                )}
                                {hojas.slice(primerTotal).map(c => (
                                    <td key={c.id} className={cn('whitespace-nowrap px-3', CLASE_ALINEAR[c.columnDef.meta?.alinear ?? 'izquierda'])}>
                                        {c.columnDef.meta?.total?.(originales)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    )
}
