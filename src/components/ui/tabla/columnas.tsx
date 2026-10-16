import type { ReactNode } from 'react'
import type { ColumnDef, RowData } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import Pill, { type TonoPill } from '@/components/ui/Pill'
import { TZ_NEGOCIO } from '@/lib/fechas'
import { compararTexto } from '@/lib/textoTabla'

/**
 * Tipos de columna de `TablaDatos`. Cada tipo trae su alineación, formato, ancho, orden y total:
 * la pantalla elige el tipo y no escribe celdas ni clases a mano, así el formato no puede salir
 * distinto entre pantallas. Vacío (null) se muestra "—" y queda al final del orden.
 */
export type TipoColumna = 'texto' | 'monto' | 'cantidad' | 'porcentaje' | 'variacion' | 'estado' | 'fecha' | 'accion'

declare module '@tanstack/react-table' {
    // oxlint-disable-next-line no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        tipo: TipoColumna
        /** Ancho fijo en px; sin ancho, la columna es la elástica (una sola por tabla: la de texto). */
        ancho?: number
        alinear: 'izquierda' | 'derecha' | 'centro'
        /** Total sobre las filas filtradas; si alguna columna lo tiene, aparece la fila de total. */
        total?: (filas: TData[]) => ReactNode
        /** Texto con el que la fila entra en la búsqueda. */
        textoBusqueda?: (fila: TData) => string
    }
}

// Formateadores creados una vez a nivel de módulo: las celdas son puras.
const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const UN_DECIMAL = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const FECHA = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_NEGOCIO, day: '2-digit', month: '2-digit', year: '2-digit' })

/** $ 850 · $ 850 k · $ 1,2 M */
export function formatoMonto(v: number): string {
    const abs = Math.abs(v)
    if (abs < 1000) return `$ ${ENTERO.format(v)}`
    if (Math.round(abs / 1000) < 1000) return `$ ${ENTERO.format(v / 1000)} k`
    return `$ ${UN_DECIMAL.format(v / 1_000_000)} M`
}

/** 12.480 */
export const formatoCantidad = (v: number): string => ENTERO.format(v)

/** 0,31 → 31% (sin decimales). */
export const formatoPorcentaje = (v: number): string => `${Math.round(v * 100)}%`

/** Actual sobre referencia (1,12 → ▲ 12%), con la escala del semáforo contra el histórico
 *  (los umbrales de Versus: 1,3 / 0,9 / 0,7). */
export function variacion(v: number): { texto: string; tono: TonoPill } {
    const delta = Math.round((v - 1) * 100)
    const texto = delta > 0 ? `▲ ${delta}%` : delta < 0 ? `▼ ${-delta}%` : '± 0%'
    const tono: TonoPill = v >= 1.3 ? 'ok' : v >= 0.9 ? 'neutro' : v >= 0.7 ? 'atencion' : 'mal'
    return { texto, tono }
}

/** 'YYYY-MM-DD' (día de negocio, sin hora) o un instante → 16/10/26 en la zona del negocio. */
function aFecha(v: string | Date): { orden: number; texto: string } {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [a, m, d] = v.split('-')
        return { orden: Date.UTC(+a, +m - 1, +d), texto: `${d}/${m}/${a.slice(2)}` }
    }
    const fecha = typeof v === 'string' ? new Date(v) : v
    return { orden: fecha.getTime(), texto: FECHA.format(fecha) }
}

const VACIO = '—'
const vacioAUndefined = <V,>(v: V | null | undefined): V | undefined =>
    v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v

type Valor<T, V> = (fila: T) => V | null | undefined

interface OpcionesNumero<T> {
    /** 'suma' suma la columna sobre las filas filtradas; una función calcula otro total (un %). */
    total?: 'suma' | ((filas: T[]) => number | null)
    /** Pisa el ancho del tipo cuando el encabezado es largo ("Visitas válidas"). */
    ancho?: number
}

function numerica<T>(
    tipo: TipoColumna,
    id: string,
    encabezado: string,
    valor: Valor<T, number>,
    anchoTipo: number,
    mostrar: (v: number) => ReactNode,
    opciones: OpcionesNumero<T> = {},
): ColumnDef<T, number | undefined> {
    const { total } = opciones
    return {
        id,
        header: encabezado,
        accessorFn: f => vacioAUndefined(valor(f)),
        sortDescFirst: true,
        cell: ({ getValue }) => {
            const v = getValue()
            return v === undefined ? VACIO : mostrar(v)
        },
        meta: {
            tipo,
            alinear: 'derecha',
            ancho: opciones.ancho ?? anchoTipo,
            total:
                total === undefined
                    ? undefined
                    : filas => {
                          const v =
                              total === 'suma'
                                  ? filas.reduce((s, f) => s + (vacioAUndefined(valor(f)) ?? 0), 0)
                                  : total(filas)
                          return v === null ? VACIO : mostrar(v)
                      },
        },
    }
}

function constructor<T>() {
    return {
        /** Nombre y, abajo, una línea chica (el código). La única columna elástica de la tabla. */
        texto(
            id: string,
            encabezado: string,
            valor: Valor<T, string>,
            opciones: { secundaria?: Valor<T, string>; buscable?: boolean } = {},
        ): ColumnDef<T, string | undefined> {
            const { secundaria, buscable = true } = opciones
            return {
                id,
                header: encabezado,
                accessorFn: f => vacioAUndefined(valor(f)),
                sortDescFirst: false,
                sortingFn: (a, b, columna) => compararTexto(a.getValue<string>(columna), b.getValue<string>(columna)),
                cell: ({ getValue, row }) => {
                    const sub = secundaria?.(row.original)
                    return (
                        <>
                            <span className="block truncate font-medium text-tinta">{getValue() ?? VACIO}</span>
                            {sub && <span className="block truncate text-[11.5px] text-tinta-2">{sub}</span>}
                        </>
                    )
                },
                meta: {
                    tipo: 'texto',
                    alinear: 'izquierda',
                    textoBusqueda: buscable ? f => [valor(f), secundaria?.(f)].filter(Boolean).join(' ') : undefined,
                },
            }
        },
        /** $ 850 k · $ 1,2 M. */
        monto: (id: string, encabezado: string, valor: Valor<T, number>, opciones?: OpcionesNumero<T>) =>
            numerica('monto', id, encabezado, valor, 112, formatoMonto, opciones),
        /** 12.480. */
        cantidad: (id: string, encabezado: string, valor: Valor<T, number>, opciones?: OpcionesNumero<T>) =>
            numerica('cantidad', id, encabezado, valor, 96, formatoCantidad, opciones),
        /** 0..1 → 31%. Con `tono`, va en un `Pill` (la métrica coloreada de la fila; el total también). */
        porcentaje: (
            id: string,
            encabezado: string,
            valor: Valor<T, number>,
            opciones: OpcionesNumero<T> & { tono?: (v: number | null) => TonoPill } = {},
        ) => {
            const { tono } = opciones
            const mostrar = tono
                ? (v: number) => <Pill tono={tono(v)}>{formatoPorcentaje(v)}</Pill>
                : formatoPorcentaje
            const columna = numerica('porcentaje', id, encabezado, valor, 80, mostrar, opciones)
            // Sin dato, el pill neutro dice "s/d": con tono, el vacío también es un estado.
            if (!tono) return columna
            return {
                ...columna,
                cell: ctx => {
                    const v = ctx.getValue()
                    return v === undefined ? <Pill tono={tono(null)}>s/d</Pill> : mostrar(v)
                },
            } satisfies ColumnDef<T, number | undefined>
        },
        /** Actual sobre referencia: pill ▲ ▼ con la escala del histórico. */
        variacion: (id: string, encabezado: string, valor: Valor<T, number>, opciones?: OpcionesNumero<T>) =>
            numerica('variacion', id, encabezado, valor, 112, v => {
                const { texto, tono } = variacion(v)
                return <Pill tono={tono} punto={false}>{texto}</Pill>
            }, opciones),
        /** Pill con texto; ordena por severidad (`orden` menor = más grave, primero). */
        estado(
            id: string,
            encabezado: string,
            valor: Valor<T, string>,
            estados: Record<string, { etiqueta: string; tono: TonoPill; orden: number }>,
        ): ColumnDef<T, number | undefined> {
            return {
                id,
                header: encabezado,
                accessorFn: f => {
                    const clave = valor(f)
                    return clave == null ? undefined : estados[clave]?.orden
                },
                sortDescFirst: false,
                cell: ({ row }) => {
                    const clave = valor(row.original)
                    const e = clave == null ? undefined : estados[clave]
                    return e ? <Pill tono={e.tono}>{e.etiqueta}</Pill> : VACIO
                },
                meta: { tipo: 'estado', alinear: 'izquierda', ancho: 120 },
            }
        },
        /** 16/10/26; ordena cronológicamente. */
        fecha(id: string, encabezado: string, valor: Valor<T, string | Date>): ColumnDef<T, number | undefined> {
            return {
                id,
                header: encabezado,
                accessorFn: f => {
                    const v = valor(f)
                    return v == null ? undefined : aFecha(v).orden
                },
                sortDescFirst: true,
                cell: ({ row }) => {
                    const v = valor(row.original)
                    return v == null ? VACIO : aFecha(v).texto
                },
                meta: { tipo: 'fecha', alinear: 'derecha', ancho: 112 },
            }
        },
        /** Ícono que abre el detalle; no ordena. */
        accion(abrir: (fila: T) => void, etiqueta: (fila: T) => string = () => 'Abrir detalle'): ColumnDef<T, undefined> {
            return {
                id: 'accion',
                header: '',
                enableSorting: false,
                cell: ({ row }) => (
                    <button
                        type="button"
                        aria-label={etiqueta(row.original)}
                        onClick={e => {
                            e.stopPropagation()
                            abrir(row.original)
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-tinta-2 hover:bg-superficie hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                ),
                meta: { tipo: 'accion', alinear: 'centro', ancho: 40 },
            }
        },
    }
}

export type ConstructorColumnas<T> = ReturnType<typeof constructor<T>>

/**
 * Declara las columnas de una tabla con tipos:
 * `definirColumnas<Fila>(c => [c.texto('nombre', 'Persona', f => f.nombre), c.cantidad(…)])`.
 * Memorizalas (`useMemo`) si dependen de algo de la pantalla: si cambian, la tabla se rearma.
 */
export function definirColumnas<T>(armar: (c: ConstructorColumnas<T>) => ColumnDef<T, any>[]): ColumnDef<T, any>[] {
    return armar(constructor<T>())
}
