import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { coincideTexto, normalizarTexto } from '@/lib/textoTabla'
import { cn } from '@/lib/utils'

export interface OpcionSelector {
    valor: string
    etiqueta: string
}

interface Base {
    /** Nombre accesible del botón y de la lista ("Vendedor"). */
    etiqueta: string
    opciones: OpcionSelector[]
    className?: string
}

type SelectorProps =
    | (Base & { multiple?: false; valor: string | null; placeholder?: string; onCambiar: (valor: string) => void })
    | (Base & { multiple: true; valores: string[]; onCambiar: (valores: string[]) => void })

/**
 * Elegir de una lista (un vendedor, o varios): el reemplazo del `<select>` nativo, que el
 * estándar no usa. Un botón de 32 px como el resto de los filtros abre la lista con buscador
 * (sin acentos ni mayúsculas). Simple: elegir cierra. Múltiple: cada opción se suma o se saca y
 * la lista queda abierta; "Todos" limpia. Escape o un clic afuera cierran.
 */
export default function Selector(props: SelectorProps) {
    const { etiqueta, opciones, className } = props
    const [abierto, setAbierto] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const raiz = useRef<HTMLDivElement>(null)
    const boton = useRef<HTMLButtonElement>(null)
    const idLista = useId()

    /** Al cerrar desde adentro (Escape, elegir), el foco vuelve al botón: la lista se desmonta
     *  con el foco adentro y, sin esto, caería en el `body`. */
    const cerrarConFoco = () => {
        setAbierto(false)
        boton.current?.focus()
    }

    useEffect(() => {
        if (!abierto) return
        const fuera = (e: MouseEvent) => {
            if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
        }
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrarConFoco()
        }
        document.addEventListener('mousedown', fuera)
        document.addEventListener('keydown', tecla)
        return () => {
            document.removeEventListener('mousedown', fuera)
            document.removeEventListener('keydown', tecla)
        }
    }, [abierto])

    const visibles = useMemo(() => {
        if (!busqueda.trim()) return opciones
        return opciones.filter(o => coincideTexto(busqueda, normalizarTexto(o.etiqueta)))
    }, [opciones, busqueda])

    const elegidos = props.multiple ? props.valores : props.valor === null ? [] : [props.valor]
    const etiquetaDe = (valor: string) => opciones.find(o => o.valor === valor)?.etiqueta ?? valor
    const texto = props.multiple
        ? elegidos.length === 0
            ? 'Todos'
            : elegidos.length === 1
              ? etiquetaDe(elegidos[0])
              : `${elegidos.length} elegidos`
        : props.valor === null
          ? (props.placeholder ?? 'Elegí…')
          : etiquetaDe(props.valor)

    const elegir = (valor: string) => {
        if (props.multiple) {
            props.onCambiar(props.valores.includes(valor) ? props.valores.filter(v => v !== valor) : [...props.valores, valor])
        } else {
            props.onCambiar(valor)
            cerrarConFoco()
        }
    }

    const abrir = () => {
        setBusqueda('')
        setAbierto(a => !a)
    }

    return (
        <div
            ref={raiz}
            className={cn('relative shrink-0', className)}
            // Salir con Tab (el foco se va afuera del selector) también cierra la lista.
            onBlur={e => {
                if (abierto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAbierto(false)
            }}
        >
            <button
                ref={boton}
                type="button"
                aria-label={etiqueta}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-controls={abierto ? idLista : undefined}
                onClick={abrir}
                className="inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg border border-linea bg-tarjeta px-2.5 text-[13px] text-tinta transition-colors hover:bg-superficie focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario"
            >
                <span className="text-tinta-2">{etiqueta}:</span>
                <span className={cn('truncate font-semibold', elegidos.length === 0 && !props.multiple && 'font-normal text-tinta-2')}>
                    {texto}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tinta-2" aria-hidden />
            </button>

            {abierto && (
                <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-linea bg-tarjeta p-1.5 shadow-lg">
                    <input
                        type="search"
                        aria-label="Buscar"
                        autoFocus
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar…"
                        className="mb-1 h-8 w-full rounded-md border border-linea bg-superficie px-2 text-[13px] text-tinta placeholder:text-tinta-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario"
                    />
                    {props.multiple && (
                        <button
                            type="button"
                            onClick={() => props.onCambiar([])}
                            className={cn(
                                'flex h-8 w-full items-center rounded-md px-2 text-left text-[13px] hover:bg-superficie',
                                elegidos.length === 0 ? 'font-semibold text-tinta' : 'text-tinta-2',
                            )}
                        >
                            Todos
                        </button>
                    )}
                    <ul
                        id={idLista}
                        role="listbox"
                        aria-label={etiqueta}
                        aria-multiselectable={props.multiple ? true : undefined}
                        className="max-h-64 overflow-y-auto"
                    >
                        {visibles.map(o => {
                            const elegida = elegidos.includes(o.valor)
                            return (
                                <li
                                    key={o.valor}
                                    role="option"
                                    aria-selected={elegida}
                                    tabIndex={0}
                                    onClick={() => elegir(o.valor)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            elegir(o.valor)
                                        }
                                    }}
                                    className={cn(
                                        'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-tinta hover:bg-superficie focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario',
                                        elegida && 'font-semibold',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                                    {elegida && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                                </li>
                            )
                        })}
                        {visibles.length === 0 && <li className="px-2 py-2 text-[13px] text-tinta-2">Sin resultados.</li>}
                    </ul>
                </div>
            )}
        </div>
    )
}
