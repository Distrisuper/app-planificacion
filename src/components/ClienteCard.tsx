import { AlertCircle, Ban, Calendar, CalendarClock, Check, Clock, MapPin, Phone, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { titleCaseNombre, initialsOfCliente } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import type { IAgendaClient } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    isToday?: boolean
    /** 'preview' = hojeando otra semana: se ve, no se opera. */
    modo?: 'operable' | 'preview'
    onAbrir: (cliente: IAgendaClient) => void
    onReagendar: (cliente: IAgendaClient) => void
    onNoVisita: (cliente: IAgendaClient) => void
    onCargarRubros: (cliente: IAgendaClient) => void
}

const ACCENT = '#213D82'

// El teléfono llega como string crudo y a veces trae más de un número
// ("1171473562 / 46641751") — solo se linkea cuando es un único número limpio,
// para no armar un tel: inválido concatenando ambos.
const TELEFONO_LIMPIO = /^[\d\s()+-]+$/

function hasTimePassed(hora: string): boolean {
    const now = new Date()
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return hora < current
}

export default function ClienteCard({
    cliente,
    isToday,
    modo = 'operable',
    onAbrir,
    onReagendar,
    onNoVisita,
    onCargarRubros,
}: ClienteCardProps) {
    const resuelto = estaResuelto(cliente.estado)
    const enCurso = cliente.estado === 'en_curso'
    const operable = modo === 'operable'
    // `||` (no `??`): nombreFantasia real puede venir como '' (sin cartel) — en ese
    // caso hay que caer a la razón social, no mostrar un nombre vacío.
    const nombre = titleCaseNombre(cliente.nombreFantasia || cliente.nombreCliente)
    const atrasado =
        !resuelto && !enCurso && !!isToday && !!cliente.horaVisita && hasTimePassed(cliente.horaVisita)
    const telefonoLimpio =
        cliente.telefono && TELEFONO_LIMPIO.test(cliente.telefono) ? cliente.telefono : null
    const pendientes = cliente.rubrosPendientes

    return (
        <div
            className="relative rounded-[14px] border p-3 pl-4 shadow-sm"
            style={{
                borderColor: resuelto ? '#BFE6CE' : '#E7E9F0',
                background: resuelto ? '#F3FAF5' : '#FFFFFF',
            }}
        >
            <div className="absolute inset-y-3 left-0 w-[3px] rounded-r-sm" style={{ background: ACCENT }} />

            <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    {cliente.horaVisita && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#54607A]">
                            <Clock className="h-3 w-3" strokeWidth={2.2} />
                            {cliente.horaVisita}
                        </span>
                    )}
                    {enCurso && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF0E1] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#B45309]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
                            En curso
                        </span>
                    )}
                    {cliente.estado === 'no_visita' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F7] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#54607A]">
                            <Ban className="h-2.5 w-2.5" strokeWidth={2.6} />
                            No visitado
                        </span>
                    )}
                    {cliente.estado === 'reagendada' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-dsnavy">
                            <CalendarClock className="h-2.5 w-2.5" strokeWidth={2.6} />
                            Reagendada
                        </span>
                    )}
                    {atrasado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEECEC] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-dsred">
                            Atrasado
                        </span>
                    )}
                </div>
                {cliente.estado === 'visitada' && (
                    <span
                        aria-label="Visitado"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-dsgreen text-white"
                    >
                        <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                )}
            </div>

            <div className="flex items-start gap-2.5">
                <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
                    style={{ background: `${ACCENT}1A`, color: ACCENT }}
                >
                    {initialsOfCliente(nombre)}
                </span>
                <div className="min-w-0 flex-1">
                    <div
                        className="text-[14.5px] font-extrabold leading-tight"
                        style={{ color: resuelto ? '#8A93A6' : '#182645' }}
                    >
                        {nombre}
                    </div>
                </div>
            </div>

            {(cliente.direccion || cliente.barrio) && (
                <div className="mt-2 flex items-start gap-1.5 pl-[38px] text-xs leading-tight text-dsmuted">
                    <MapPin className="mt-0.5 h-[13px] w-[13px] shrink-0" strokeWidth={2} />
                    <span>{cliente.direccion || cliente.barrio}</span>
                </div>
            )}

            {cliente.telefono && telefonoLimpio && (
                <a
                    href={`tel:+54${telefonoLimpio.replace(/\D/g, '')}`}
                    onClick={e => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1.5 pl-[38px] text-xs font-semibold text-dsnavy"
                >
                    <Phone className="h-[13px] w-[13px]" strokeWidth={2} />
                    {cliente.telefono}
                </a>
            )}

            {cliente.telefono && !telefonoLimpio && (
                <span className="mt-1 inline-flex items-center gap-1.5 pl-[38px] text-xs font-semibold text-dsnavy">
                    <Phone className="h-[13px] w-[13px]" strokeWidth={2} />
                    {cliente.telefono}
                </span>
            )}

            {/* Rubros sin cargar: traban el cierre de la semana, así que el aviso va
                donde el vendedor ya está mirando y no recién al final. */}
            {operable && pendientes > 0 && cliente.visitaId !== null && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCargarRubros(cliente)}
                    className="mt-2.5 h-10 w-full border-[#F0D8A8] bg-[#FEF8EC] text-[12.5px] font-bold text-[#B45309]"
                >
                    <AlertCircle className="h-[14px] w-[14px]" strokeWidth={2.2} />
                    {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar
                </Button>
            )}

            {operable && !resuelto && (
                <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#EDEFF4] pt-2.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrir(cliente)}
                        className="h-11 w-full border-[#D8DEEA] text-[13px] text-dsnavy"
                    >
                        <Zap className="h-[14px] w-[14px]" strokeWidth={2} />
                        Propuesta
                    </Button>
                    <div className="flex gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReagendar(cliente)}
                            className="h-11 flex-1 border-[#D8DEEA] text-[12.5px] text-dsnavy"
                        >
                            <Calendar className="h-[14px] w-[14px]" strokeWidth={2} />
                            Reagendar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onNoVisita(cliente)}
                            className="h-11 flex-1 border-[#D8DEEA] text-[12.5px] text-dsnavy"
                        >
                            <Ban className="h-[14px] w-[14px]" strokeWidth={2} />
                            No visité
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
