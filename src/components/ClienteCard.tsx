import { useState } from 'react'
import { Calendar, Check, Clock, MapPin, Phone, Pencil, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORIA_COLORS, CATEGORIA_COLOR_DEFAULT, CATEGORIA_ICONS } from '@/lib/categoriaColors'
import { titleCaseNombre, initialsOfCliente } from '@/lib/textFormat'
import type { IAgendaClient } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    isToday?: boolean
    onAbrir: (codigo: string) => void
    onReagendar: (codigo: string) => void
}

function hasTimePassed(hora: string): boolean {
    const now = new Date()
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return hora < current
}

export default function ClienteCard({ cliente, isToday, onAbrir, onReagendar }: ClienteCardProps) {
    const [notaAbierta, setNotaAbierta] = useState(false)
    const resuelto = !!cliente.resuelto
    const accent = cliente.categoria ? CATEGORIA_COLORS[cliente.categoria] : CATEGORIA_COLOR_DEFAULT
    const CategoriaIcon = cliente.categoria ? CATEGORIA_ICONS[cliente.categoria] : null
    const nombre = titleCaseNombre(cliente.nombreCliente)
    const atrasado = !resuelto && !cliente.enCurso && !!isToday && !!cliente.horaVisita && hasTimePassed(cliente.horaVisita)

    return (
        <div
            className="relative rounded-[14px] border p-3 pl-4 shadow-sm"
            style={{
                borderColor: resuelto ? '#BFE6CE' : '#E7E9F0',
                background: resuelto ? '#F3FAF5' : '#FFFFFF',
            }}
        >
            <div className="absolute inset-y-3 left-0 w-[3px] rounded-r-sm" style={{ background: accent }} />

            <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    {cliente.horaVisita && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#54607A]">
                            <Clock className="h-3 w-3" strokeWidth={2.2} />
                            {cliente.horaVisita}
                        </span>
                    )}
                    {cliente.enCurso && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF0E1] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#B45309]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
                            En curso
                        </span>
                    )}
                    {atrasado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEECEC] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-dsred">
                            Atrasado
                        </span>
                    )}
                </div>
                {resuelto && (
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
                    style={{ background: `${accent}1A`, color: accent }}
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
                    {cliente.categoria && (
                        <div className="mt-1 flex items-center gap-1.5">
                            {CategoriaIcon && <CategoriaIcon className="h-3 w-3" style={{ color: accent }} strokeWidth={2.2} />}
                            <span className="text-[11px] font-bold" style={{ color: accent }}>
                                {cliente.categoria}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {(cliente.direccion || cliente.barrio) && (
                <div className="mt-2 flex items-start gap-1.5 pl-[38px] text-xs leading-tight text-dsmuted">
                    <MapPin className="mt-0.5 h-[13px] w-[13px] shrink-0" strokeWidth={2} />
                    <span>{cliente.direccion ?? cliente.barrio}</span>
                </div>
            )}

            {cliente.telefono && (
                <a
                    href={`tel:+54${cliente.telefono.replace(/\D/g, '')}`}
                    onClick={e => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1.5 pl-[38px] text-xs font-semibold text-dsnavy"
                >
                    <Phone className="h-[13px] w-[13px]" strokeWidth={2} />
                    {cliente.telefono}
                </a>
            )}

            {cliente.nota && (
                <button
                    onClick={e => {
                        e.stopPropagation()
                        setNotaAbierta(o => !o)
                    }}
                    className="mt-2 flex w-full gap-1.5 rounded-[9px] border border-[#F3E1B4] bg-[#FFF7E6] px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-[#7A5B12]"
                >
                    <Pencil className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
                    <span className={notaAbierta ? '' : 'line-clamp-2'}>{cliente.nota}</span>
                </button>
            )}

            {!resuelto && (
                <div className="mt-2.5 flex gap-1.5 border-t border-[#EDEFF4] pt-2.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrir(cliente.codigoParticularCliente)}
                        className="h-11 flex-1 border-[#D8DEEA] text-[13px] text-dsnavy"
                    >
                        <Zap className="h-[14px] w-[14px]" strokeWidth={2} />
                        Propuesta
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReagendar(cliente.codigoParticularCliente)}
                        className="h-11 flex-1 border-[#D8DEEA] text-[13px] text-dsnavy"
                    >
                        <Calendar className="h-[14px] w-[14px]" strokeWidth={2} />
                        Reagendar
                    </Button>
                </div>
            )}
        </div>
    )
}
