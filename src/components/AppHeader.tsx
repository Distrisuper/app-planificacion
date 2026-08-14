import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import AccountMenu from '@/components/AccountMenu'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
    vendedorNombre: string
    completadas: number
    total: number
    /** Texto central, ya armado por el caller: "Zárate · 13 – 17 Jul" (o "Semana 3 · …" si la
     *  zona no tiene descripción). Este componente no arma el string, solo lo pinta. */
    tituloSemana: string
    /** 'preview' = hojeando una semana que no es la abierta. */
    modo?: 'operable' | 'preview'
    onLogout?: () => void
    onPrevWeek?: () => void
    onNextWeek?: () => void
    /** Abre el buscador general de solo lectura (spec 2026-08-12). Sin esta prop no se
     *  pinta el ícono — mantiene el patrón de props-only del resto de las acciones, sin
     *  acoplar este componente a react-query. */
    onAbrirBuscadorGeneral?: () => void
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
    completadas,
    total,
    tituloSemana,
    modo,
    onLogout,
    onPrevWeek,
    onNextWeek,
    onAbrirBuscadorGeneral,
}: AppHeaderProps) {
    const pct = total > 0 ? Math.round((completadas / total) * 100) : 0
    const preview = modo === 'preview'

    return (
        <header className="bg-dsnavy text-white px-4 pt-3 pb-3.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 shrink items-center gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                        <span className="text-[15px] font-black leading-none tracking-tight text-dsnavy">
                            D<span className="text-dsgreen">S</span>
                        </span>
                    </div>
                    <span className="truncate text-[15px] font-extrabold tracking-tight">DistriSuper</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {onAbrirBuscadorGeneral && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Buscar en toda la rotación"
                            onClick={onAbrirBuscadorGeneral}
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

            {/* Las flechas ya no son decorativas: son el navegador de zonas. aria-label porque
                los tests (y el lector de pantalla) las identifican por nombre accesible, no por
                el ícono. "Zona", no "semana": el vendedor no ve vocabulario de ciclo/rotación
                (ver docs/dominio/modelo.md y el spec de 2026-08-12). */}
            <div className="mt-2.5 flex items-center justify-between gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Zona anterior"
                    onClick={onPrevWeek}
                    className="h-7 w-7 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
                >
                    <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.4} />
                </Button>
                <div className="min-w-0 text-center">
                    <div className="truncate text-[13.5px] font-extrabold">{tituloSemana}</div>
                    {preview ? (
                        <span className="mt-0.5 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white/80">
                            Vista previa
                        </span>
                    ) : (
                        <div className="text-[10.5px] font-semibold text-white/60">Clientes a visitar</div>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Zona siguiente"
                    onClick={onNextWeek}
                    className="h-7 w-7 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
                >
                    <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
                </Button>
            </div>

            {/* Sin barra de progreso en preview: no hay progreso de una semana que no se trabaja,
                y mostrar 0/39 se leería como "no hiciste nada" en vez de "no es tu semana". */}
            {!preview && (
                <div className="mt-2.5">
                    <div className="mb-1.5 flex justify-between text-[11.5px] font-semibold text-white/70">
                        <span>Visitas completadas</span>
                        <span className="font-extrabold text-white">
                            {completadas} / {total}
                        </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                            className="h-full rounded-full bg-dsgreen transition-[width] duration-300 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            )}
        </header>
    )
}
