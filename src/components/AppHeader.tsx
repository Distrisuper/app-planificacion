import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import AccountMenu from '@/components/AccountMenu'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
    vendedorNombre: string
    /** Nombre de la zona, ya armado por el caller: "Zárate" (o "Semana 3" si la zona no
     *  tiene descripción). Este componente no arma el string, solo lo pinta. */
    tituloSemana: string
    /** Va al lado del título, más chico: el rango de la semana laboral ("28 sep – 2 oct").
     *  En preview no se pinta: ahí va el chip "Vista previa". */
    subtitulo?: string
    /** 'preview' = hojeando una semana que no es la abierta. */
    modo?: 'operable' | 'preview'
    onLogout?: () => void
    onPrevWeek?: () => void
    onNextWeek?: () => void
    /**
     * Búsqueda general (solo lectura, toda la cartera). Sin `onAbrirBusqueda` no se
     * pinta la lupa — este componente sigue siendo props-only, no toca react-query.
     *
     * Cuando `buscando` es true el header SE ADAPTA en vez de abrir un modal encima: la
     * fila entera se convierte en el campo de búsqueda y la navegación de zonas se oculta:
     * es de la zona que se está mirando, y buscar es justamente salir de esa zona.
     */
    buscando?: boolean
    textoBusqueda?: string
    onAbrirBusqueda?: () => void
    onCambiarBusqueda?: (texto: string) => void
    onCerrarBusqueda?: () => void
}

function initialsOf(name: string) {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase())
        .join('')
    return initials || 'V'
}

export default function AppHeader({
    vendedorNombre,
    tituloSemana,
    subtitulo,
    modo,
    onLogout,
    onPrevWeek,
    onNextWeek,
    buscando = false,
    textoBusqueda = '',
    onAbrirBusqueda,
    onCambiarBusqueda,
    onCerrarBusqueda,
}: AppHeaderProps) {
    const preview = modo === 'preview'

    // Dos líneas finas (marca · lupa · avatar, y debajo ‹ zona ›) + las pestañas de días
    // de DiaTabs: tres líneas en total. Antes eran tres filas gordas solo acá —marca,
    // navegador de zona con subtítulo y "Visitas completadas"— y con la tab bar abajo la
    // lista de clientes quedaba en card y media. La zona tiene su propia línea para que
    // las flechas queden anchas y lejos del avatar: juntas en una fila se tocaban.
    return (
        <header className="bg-dsnavy px-3.5 pb-1.5 pt-2.5 text-white">
            {buscando ? (
                <div className="mb-1 flex min-w-0 items-center gap-2 rounded-[11px] bg-white/12 px-3 py-1.5">
                    <Search className="h-4 w-4 shrink-0 text-white/60" strokeWidth={2.4} />
                    <input
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none placeholder:font-medium placeholder:text-white/50"
                        placeholder="Buscar cliente…"
                        value={textoBusqueda}
                        onChange={e => onCambiarBusqueda?.(e.target.value)}
                        autoFocus
                    />
                    <button
                        type="button"
                        aria-label="Cerrar búsqueda"
                        onClick={onCerrarBusqueda}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/70 active:text-white"
                    >
                        <X className="h-4 w-4" strokeWidth={2.6} />
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                                <span className="text-[13px] font-black leading-none tracking-tight text-dsnavy">
                                    D<span className="text-dsgreen">S</span>
                                </span>
                            </div>
                            <span className="truncate text-[14px] font-extrabold tracking-tight">DistriSuper</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            {onAbrirBusqueda && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Buscar cliente"
                                    onClick={onAbrirBusqueda}
                                    className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                                >
                                    <Search className="h-[17px] w-[17px]" strokeWidth={2.2} />
                                </Button>
                            )}
                            {onLogout ? (
                                <AccountMenu nombre={vendedorNombre} onLogout={onLogout} />
                            ) : (
                                <Avatar initials={initialsOf(vendedorNombre)} />
                            )}
                        </div>
                    </div>

                    {/* Las flechas son el navegador de zonas. aria-label porque los tests (y el
                        lector de pantalla) las identifican por nombre accesible, no por el
                        ícono. "Zona", no "semana": el vendedor no ve vocabulario de
                        ciclo/rotación (ver docs/dominio/modelo.md y el spec de 2026-08-12). */}
                    <div className="mt-1 flex items-center justify-between gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Zona anterior"
                            onClick={onPrevWeek}
                            className="h-8 w-10 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                        </Button>
                        <div className="flex min-w-0 items-center justify-center gap-1.5">
                            <span className="truncate text-[13.5px] font-extrabold">{tituloSemana}</span>
                            {preview ? (
                                <span className="shrink-0 rounded-full bg-white/15 px-2 py-px text-[9.5px] font-extrabold uppercase tracking-wide text-white/80">
                                    Vista previa
                                </span>
                            ) : (
                                subtitulo && (
                                    <span className="shrink-0 text-[11px] font-semibold text-white/60">· {subtitulo}</span>
                                )
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Zona siguiente"
                            onClick={onNextWeek}
                            className="h-8 w-10 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
                        </Button>
                    </div>
                </>
            )}
        </header>
    )
}
