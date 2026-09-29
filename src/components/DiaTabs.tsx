import { useMemo } from 'react'
import { getWeekDates, isSameDay } from '@/lib/weekDates'
import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface DiaTabsProps {
    activo: Dia
    onSelect: (dia: Dia) => void
}

/**
 * Pestañas de día, en UNA línea fina: el día y su número ("LUN 28") y un punto verde en
 * HOY. Sin el conteo resueltos/total: ya lo dice la banda del día en el tablero, y
 * duplicado solo le costaba alto a la lista de clientes.
 */
export default function DiaTabs({ activo, onSelect }: DiaTabsProps) {
    const fechas = useMemo(() => getWeekDates(), [])
    const hoy = useMemo(() => new Date(), [])

    return (
        <div className="flex shrink-0 gap-1.5 border-b border-dsline bg-white px-3 py-2">
            {DIAS.map(d => {
                const isActive = d === activo
                const esHoy = isSameDay(fechas[d], hoy)
                return (
                    <button
                        key={d}
                        onClick={() => onSelect(d)}
                        className={`relative flex min-w-0 flex-1 items-center justify-center rounded-[10px] border py-1.5 text-[12px] font-extrabold tracking-wide transition-colors ${
                            isActive ? 'border-dsnavy bg-dsnavy text-white' : 'border-dsline bg-[#F4F6FA] text-[#3B4560]'
                        }`}
                    >
                        {esHoy && (
                            <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-dsgreen ring-2 ring-white" />
                        )}
                        <span>
                            {d} <span className={isActive ? 'text-white/70' : 'text-dsmuted'}>{fechas[d].getDate()}</span>
                        </span>
                        {/* Al final y no junto al punto: el nombre accesible tiene que seguir
                            empezando por el día ("LUN 28, hoy"). */}
                        {esHoy && <span className="sr-only">, hoy</span>}
                    </button>
                )
            })}
        </div>
    )
}
