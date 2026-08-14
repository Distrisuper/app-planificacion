import { useEffect, useMemo, useRef } from 'react'
import { Plus } from 'lucide-react'
import ClienteCard from './ClienteCard'
import { getWeekDates, formatDayDate, isSameDay } from '@/lib/weekDates'
import { estaResuelto } from '@/lib/estadoCiclo'
import type { AppExterna } from '@/lib/appsExternas'
import type { Dia, IAgendaClient, IVisitClientCard, SemanaAgenda } from '@/types/planificacion'

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
    /** Si se pasa, cada encabezado de día muestra un "+" que abre el buscador con ESE
     *  día como destino. Sin la prop no se pinta: en preview de otra zona no hay dónde
     *  agregar (la extra y el reacomodar van contra la zona en curso). */
    onAgregarCliente?: (dia: Dia) => void
    onAbrir: (cliente: IAgendaClient) => void
    onEstadoVisita: (cliente: IAgendaClient) => void
    onIniciarVisita: (cliente: IAgendaClient) => void
    onAbrirAppExterna: (app: AppExterna, cliente: IVisitClientCard) => void
}

export default function AgendaBoard({
    semana,
    activo,
    modo,
    hayVisitaEnCurso = false,
    onActivoChange,
    onAgregarCliente,
    onAbrir,
    onEstadoVisita,
    onIniciarVisita,
    onAbrirAppExterna,
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
    // El scroll container nace con scrollLeft 0 (columna LUN), pero `activo` YA puede ser
    // otro día al montar: AgendaSemanaPage arranca en el día de hoy (getDiaDeHoy()), no en
    // LUN. Si el primer render no corrige el scroll, el board queda mostrando LUN mientras
    // los tabs de arriba marcan VIE — el board nunca lo corrige solo porque nada dispara
    // onScroll hasta que el vendedor swipea.
    //
    // La corrección en el montaje va sin animación (instantánea, `behavior: 'auto'`): un
    // smooth scroll de varias columnas al abrir la app se ve como una animación no pedida.
    // Los montajes posteriores (tocar un tab) sí animan — ahí es una respuesta directa al
    // toque del vendedor.
    const montado = useRef(false)

    useEffect(() => {
        const el = columnRefs.current[activo]
        if (!el?.scrollIntoView) return
        if (!montado.current) {
            montado.current = true
            ignoreScrollUntil.current = Date.now() + 500
            el.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' })
            return
        }
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
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <span
                                        className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                                        style={{
                                            background: allDone ? '#009E4F' : isToday ? 'rgba(255,255,255,.18)' : '#EEF1F7',
                                            color: allDone || isToday ? '#FFFFFF' : '#4B577A',
                                        }}
                                    >
                                        {done}/{total}
                                    </span>
                                    {/* Dentro del encabezado del día y no flotando sobre el board:
                                        el board es swipeable entre columnas, así que un botón fijo
                                        no puede decir a QUÉ día agrega — y este sheet escribe en una
                                        celda concreta (semana, día). */}
                                    {onAgregarCliente && (
                                        <button
                                            type="button"
                                            aria-label={`Agregar cliente al ${DIA_NOMBRE[d].toLowerCase()}`}
                                            onClick={() => onAgregarCliente(d)}
                                            className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
                                                isToday
                                                    ? 'bg-white/20 text-white active:bg-white/30'
                                                    : 'bg-[#EEF1F7] text-[#4B577A] active:bg-[#E1E6F0]'
                                            }`}
                                        >
                                            <Plus className="h-4 w-4" strokeWidth={2.6} />
                                        </button>
                                    )}
                                </div>
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
                                        onAbrirAppExterna={onAbrirAppExterna}
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
