interface AppHeaderProps {
    vendedorNombre: string
    completadas: number
    total: number
    rangoSemana: string
}

export default function AppHeader({ vendedorNombre, completadas, total, rangoSemana }: AppHeaderProps) {
    const pct = total > 0 ? Math.round((completadas / total) * 100) : 0
    return (
        <header className="bg-dsnavy text-white px-4 pt-3 pb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded bg-white/15 text-xs font-bold">DS</span>
                    <div>
                        <div className="text-sm font-bold leading-tight">DistriSuper</div>
                        <div className="text-[11px] text-white/60">Ruta de reparto</div>
                    </div>
                </div>
                <div className="text-right text-sm font-semibold">{vendedorNombre}</div>
            </div>
            <div className="mt-3 text-center text-sm font-bold">Semana {rangoSemana}</div>
            <div className="mt-2">
                <div className="flex justify-between text-[11px] text-white/70">
                    <span>Visitas completadas</span>
                    <span>{completadas} / {total}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-white/20">
                    <div className="h-full rounded bg-dsgreen" style={{ width: `${pct}%` }} />
                </div>
            </div>
        </header>
    )
}
