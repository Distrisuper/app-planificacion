import { useEffect, useMemo, useRef } from 'react'
import ClienteCard from './ClienteCard'
import { getWeekDates, formatDayDate, isSameDay } from '@/lib/weekDates'
import { estaResuelto } from '@/lib/estadoCiclo'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const DIA_NOMBRE: Record<Dia, string> = { LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves', VIE: 'Viernes' }

interface AgendaBoardProps {
    semana: SemanaAgenda | undefined
    activo: Dia
    modo?: 'operable' | 'preview'
    /** Hay una visita en curso en algún cliente de la semana: bloquea "Iniciar visita"
     *  en el resto de las cards pendientes (el vendedor no puede estar en dos a la vez). */
    hayVisitaEnCurso?: boolean
    onActivoChange: (dia: Dia) => void
    onAbrir: (cliente: IAgendaClient) => void
    onEstadoVisita: (cliente: IAgendaClient) => void
    onIniciarVisita: (cliente: IAgendaClient) => void
}

export default function AgendaBoard({
    semana,
    activo,
    modo,
    hayVisitaEnCurso = false,
    onActivoChange,
    onAbrir,
    onEstadoVisita,
    onIniciarVisita,
}: AgendaBoardProps) {
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
    // El primer render siempre arranca en LUN (el primer día, índice 0): el scroll
    // container ya nace con scrollLeft 0, no hace falta ningún scrollIntoView para
    // mostrarlo. Forzar ese scroll al montar — antes de que la agenda cargue y el layout
    // termine de asentarse — es lo que dejaba la columna corrida (scrollIntoView calcula
    // la posición con el layout que haya en ese instante; si corre temprano, esa posición
    // puede quedar levemente mal y, al ser instantánea, nada la vuelve a corregir). Este
    // efecto arranca ignorando su primera corrida: solo actúa ante un cambio real de
    // `activo` (tocar un tab), momento en el que el layout ya está asentado hace rato.
    const montado = useRef(false)

    useEffect(() => {
        if (!montado.current) {
            montado.current = true
            return
        }
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
            className="no-scrollbar flex flex-1 overflow-x-auto overflow-y-hidden pb-5 pt-3"
            style={{
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                minHeight: 0,
                // Sin esto, cuando el contenido de arriba/abajo cambia de tamaño (p.ej. los
                // contadores 0/0 → reales al llegar la agenda), Chrome mueve el scroll solo
                // para "anclar" la posición visual — sin volver a evaluar scroll-snap, así
                // que la columna queda corrida hasta el próximo scroll real del usuario.
                overflowAnchor: 'none',
            }}
        >
            {DIAS.map(d => {
                const clientesDia = semana?.[d] ?? []
                const done = clientesDia.filter(c => estaResuelto(c.estado)).length
                const total = clientesDia.length
                const allDone = total > 0 && done === total
                const isToday = isSameDay(weekDates[d], today)
                // Los resueltos van al final: así arriba solo quedan los que faltan, sin
                // separador — ya se distinguen por su propio estilo (tachado, fondo verde).
                const clientes = [
                    ...clientesDia.filter(c => !estaResuelto(c.estado)),
                    ...clientesDia.filter(c => estaResuelto(c.estado)),
                ]

                return (
                    <div
                        key={d}
                        ref={el => {
                            if (el) columnRefs.current[d] = el
                        }}
                        className="flex w-full shrink-0 flex-col px-3"
                        style={{ scrollSnapAlign: 'start' }}
                    >
                        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-dsline bg-white shadow-sm">
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
                                        modo={modo}
                                        otraVisitaEnCurso={hayVisitaEnCurso && c.estado !== 'en_curso'}
                                        onAbrir={onAbrir}
                                        onEstadoVisita={onEstadoVisita}
                                        onIniciarVisita={onIniciarVisita}
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
                    </div>
                )
            })}
        </div>
    )
}
