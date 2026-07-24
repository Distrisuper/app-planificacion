import { useEffect, useMemo, useRef } from 'react'
import ClienteCard from './ClienteCard'
import { getWeekDates, formatDayDate, isSameDay } from '@/lib/weekDates'
import type { Dia, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const DIA_NOMBRE: Record<Dia, string> = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes' }

interface AgendaBoardProps {
    semana: SemanaAgenda | undefined
    activo: Dia
    onActivoChange: (dia: Dia) => void
    onAbrir: (codigo: string) => void
    onReagendar: (codigo: string) => void
}

export default function AgendaBoard({ semana, activo, onActivoChange, onAbrir, onReagendar }: AgendaBoardProps) {
    const boardRef = useRef<HTMLDivElement>(null)
    const columnRefs = useRef<Partial<Record<Dia, HTMLDivElement>>>({})
    const weekDates = useMemo(() => getWeekDates(), [])
    const today = useMemo(() => new Date(), [])
    // A programmatic smooth scroll fires many scroll events while it's mid-transit,
    // not just one — ignoring only the next event let a mid-transit column win the
    // "closest" check below, which called onActivoChange with a transient day and
    // restarted the scroll animation toward it (the "roto"/jittery tab behavior).
    // Ignore every scroll event for the animation's duration instead of just one.
    const ignoreScrollUntil = useRef(0)

    useEffect(() => {
        const el = columnRefs.current[activo]
        if (!el?.scrollIntoView) return
        ignoreScrollUntil.current = Date.now() + 500
        el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    }, [activo])

    function onScroll() {
        if (Date.now() < ignoreScrollUntil.current) return
        const board = boardRef.current
        if (!board) return
        const boardLeft = board.getBoundingClientRect().left
        let closest: Dia = activo
        let closestDist = Infinity
        for (const d of DIAS) {
            const col = columnRefs.current[d]
            if (!col) continue
            const dist = Math.abs(col.getBoundingClientRect().left - boardLeft)
            if (dist < closestDist) {
                closestDist = dist
                closest = d
            }
        }
        if (closest !== activo) onActivoChange(closest)
    }

    return (
        <div
            ref={boardRef}
            onScroll={onScroll}
            className="no-scrollbar flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-3 pb-5 pt-3"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', minHeight: 0 }}
        >
            {DIAS.map(d => {
                const clientes = semana?.[d] ?? []
                const done = clientes.filter(c => c.resuelto).length
                const total = clientes.length
                const allDone = total > 0 && done === total
                const isToday = isSameDay(weekDates[d], today)

                return (
                    <div
                        key={d}
                        ref={el => {
                            if (el) columnRefs.current[d] = el
                        }}
                        className="flex w-[86vw] max-w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-dsline bg-white shadow-sm"
                        style={{ scrollSnapAlign: 'start' }}
                    >
                        <div
                            className={`flex shrink-0 items-center justify-between px-3.5 py-3 ${
                                isToday ? 'bg-dsnavy' : 'border-b border-[#EEF1F7] bg-white'
                            }`}
                        >
                            <div className="flex flex-col leading-tight">
                                <span className={`text-[13.5px] font-extrabold ${isToday ? 'text-white' : 'text-[#182645]'}`}>
                                    {DIA_NOMBRE[d]}
                                </span>
                                <span className={`text-[11px] font-semibold ${isToday ? 'text-white/70' : 'text-dsmuted'}`}>
                                    {formatDayDate(weekDates[d])}
                                </span>
                            </div>
                            <span
                                className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                                style={{
                                    background: allDone ? '#009E4F' : isToday ? 'rgba(255,255,255,.18)' : '#EEF1F7',
                                    color: allDone || isToday ? '#FFFFFF' : '#4B577A',
                                }}
                            >
                                {done}/{total}
                            </span>
                        </div>
                        <div className="no-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto bg-[#F7F8FB] p-2.5" style={{ minHeight: 0 }}>
                            {clientes.map(c => (
                                <ClienteCard
                                    key={c.codigoParticularCliente}
                                    cliente={c}
                                    isToday={isToday}
                                    onAbrir={onAbrir}
                                    onReagendar={onReagendar}
                                />
                            ))}
                            {clientes.length === 0 && (
                                <div className="py-8 text-center text-xs font-medium leading-relaxed text-[#A6AEBD]">
                                    <div className="mb-1 text-2xl">✓</div>
                                    Sin visitas
                                    <br />
                                    este día
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
