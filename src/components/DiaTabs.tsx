import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface DiaTabsProps {
    activo: Dia
    counts: Record<Dia, { done: number; total: number }>
    onSelect: (dia: Dia) => void
}

export default function DiaTabs({ activo, counts, onSelect }: DiaTabsProps) {
    return (
        <div className="flex gap-2 overflow-x-auto px-3 py-3">
            {DIAS.map(d => {
                const c = counts[d]
                const isActive = d === activo
                return (
                    <button
                        key={d}
                        onClick={() => onSelect(d)}
                        className={`flex min-w-[64px] flex-col items-center rounded-lg border px-3 py-2 text-xs font-semibold ${
                            isActive ? 'border-dsnavy bg-dsnavy text-white' : 'border-slate-200 bg-white text-dsnavy'
                        }`}
                    >
                        <span>{d}</span>
                        <span className={isActive ? 'text-white/70' : 'text-dsmuted'}>
                            {c.done}/{c.total}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
