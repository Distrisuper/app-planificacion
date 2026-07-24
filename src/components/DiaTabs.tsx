import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface DiaTabsProps {
    activo: Dia
    counts: Record<Dia, { done: number; total: number }>
    onSelect: (dia: Dia) => void
}

export default function DiaTabs({ activo, counts, onSelect }: DiaTabsProps) {
    return (
        <div className="flex shrink-0 gap-1.5 border-b border-dsline bg-white px-3 py-2.5">
            {DIAS.map(d => {
                const c = counts[d]
                const isActive = d === activo
                return (
                    <button
                        key={d}
                        onClick={() => onSelect(d)}
                        className={`flex flex-1 flex-col items-center gap-0.5 rounded-[11px] border py-1.5 text-[11.5px] font-extrabold tracking-wide transition-colors ${
                            isActive ? 'border-dsnavy bg-dsnavy text-white' : 'border-dsline bg-[#F4F6FA] text-[#3B4560]'
                        }`}
                    >
                        <span>{d}</span>
                        <span className={`text-[10px] font-bold ${isActive ? 'text-white/70' : 'text-dsmuted'}`}>
                            {c.done}/{c.total}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
