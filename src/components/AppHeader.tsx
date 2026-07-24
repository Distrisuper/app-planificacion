import { ChevronLeft, ChevronRight } from 'lucide-react'
import AccountMenu from '@/components/AccountMenu'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
    vendedorNombre: string
    completadas: number
    total: number
    rangoSemana: string
    onLogout?: () => void
    onPrevWeek?: () => void
    onNextWeek?: () => void
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
    rangoSemana,
    onLogout,
    onPrevWeek,
    onNextWeek,
}: AppHeaderProps) {
    const pct = total > 0 ? Math.round((completadas / total) * 100) : 0

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
                <div className="flex shrink-0 items-center">
                    {onLogout ? (
                        <AccountMenu nombre={vendedorNombre} onLogout={onLogout} />
                    ) : (
                        <Avatar initials={initialsOf(vendedorNombre)} />
                    )}
                </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Semana anterior"
                    onClick={onPrevWeek}
                    className="h-9 w-9 text-white hover:bg-white/15"
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                </Button>
                <div className="flex flex-1 flex-col items-center whitespace-nowrap leading-tight">
                    <span className="text-[14.5px] font-extrabold">Semana {rangoSemana}</span>
                    <span className="text-[10.5px] text-white/60">Clientes a visitar</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Semana siguiente"
                    onClick={onNextWeek}
                    className="h-9 w-9 text-white hover:bg-white/15"
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
                </Button>
            </div>

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
        </header>
    )
}
