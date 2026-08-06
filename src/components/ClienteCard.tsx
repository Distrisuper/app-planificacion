import { Ban, Calendar, CalendarClock, Check, ChevronRight, Lock, MapPin, Phone, Play, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AccionesExternas from './AccionesExternas'
import { titleCaseNombre } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import type { AppExterna } from '@/lib/appsExternas'
import type { IAgendaClient, IVisitClientCard } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    /** 'preview' = hojeando otra semana: se ve, no se opera. */
    modo?: 'operable' | 'preview'
    /** El vendedor ya tiene una visita en curso EN OTRO cliente: no puede tener dos
     *  visitas abiertas a la vez, así que acá "Iniciar visita" se muestra bloqueado
     *  en vez de dejar que el vendedor lo intente y recién se entere en el sheet. */
    otraVisitaEnCurso?: boolean
    onAbrir: (cliente: IAgendaClient) => void
    onEstadoVisita: (cliente: IAgendaClient) => void
    /** Arranca la visita derecho, sin pasar por la propuesta: va directo al mapa
     *  de confirmación (o inicia sin más si el cliente no tiene coordenadas). */
    onIniciarVisita: (cliente: IAgendaClient) => void
    onAbrirAppExterna: (app: AppExterna, cliente: IVisitClientCard) => void
}

// Utilidades (llamar/reagendar). Viven en el header, no en el área de acciones: son
// auxiliares al ciclo de la visita, y como fila propia de botones sumaban una cuarta
// caja que hacía la card innecesariamente alta en una columna de 7-8 clientes. Acá
// aprovechan el hueco que la card pendiente ya tenía a la derecha del código.
const HEADER_ACTION =
    'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#F4F6FA] text-[11.5px] font-semibold text-[#54607A] hover:bg-[#EAEEF6]'
// El teléfono va sin texto porque el ícono ya se entiende solo; "reagendar" NO tiene
// ícono universal (un calendario a secas no dice qué le va a pasar al cliente), así que
// ese lleva label sí o sí — se probó como ícono pelado y no se entendía.
const HEADER_ICON_ONLY = `${HEADER_ACTION} w-8`
const HEADER_WITH_LABEL = `${HEADER_ACTION} px-2.5`

const ACCENT = '#213D82'

// El teléfono llega como string crudo y a veces trae más de un número
// ("1171473562 / 46641751") — solo se linkea cuando es un único número limpio,
// para no armar un tel: inválido concatenando ambos.
const TELEFONO_LIMPIO = /^[\d\s()+-]+$/

export default function ClienteCard({
    cliente,
    modo = 'operable',
    otraVisitaEnCurso = false,
    onAbrir,
    onEstadoVisita,
    onIniciarVisita,
    onAbrirAppExterna,
}: ClienteCardProps) {
    const resuelto = estaResuelto(cliente.estado)
    const enCurso = cliente.estado === 'en_curso'
    const noVisitado = cliente.estado === 'no_visita'
    const operable = modo === 'operable'
    // Solo se puede arrancar de cero un cliente que todavía no tiene visita: una vez
    // iniciada (en_curso) o resuelta, "Iniciar visita" ya no aplica. Tampoco aplica con
    // otra visita ya abierta — el backend la rechazaría igual (VISITA_ACTIVA_EXISTENTE),
    // pero mostrarlo bloqueado acá evita el viaje al servidor para enterarse.
    const puedeIniciar = cliente.estado === 'pendiente' && !otraVisitaEnCurso
    // `||` (no `??`): nombreFantasia real puede venir como '' (sin cartel) — en ese
    // caso hay que caer a la razón social, no mostrar un nombre vacío.
    const nombre = titleCaseNombre(cliente.nombreFantasia || cliente.nombreCliente)
    const telefonoLimpio =
        cliente.telefono && TELEFONO_LIMPIO.test(cliente.telefono) ? cliente.telefono : null
    const direccionTexto = cliente.direccion || cliente.barrio
    const mapsHref =
        cliente.latitud != null && cliente.longitud != null
            ? `https://www.google.com/maps/search/?api=1&query=${cliente.latitud},${cliente.longitud}`
            : direccionTexto
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionTexto)}`
              : null

    return (
        <div
            className="rounded-[14px] border p-3 shadow-sm"
            style={{
                borderColor: noVisitado ? '#F0D8A8' : resuelto ? '#BFE6CE' : '#E7E9F0',
                background: noVisitado ? '#FEF8EC' : resuelto ? '#F3FAF5' : '#FFFFFF',
            }}
        >
            <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-dsmuted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />#
                        {cliente.codigoParticularCliente}
                    </span>
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
                </div>
                {cliente.estado === 'visitada' && (
                    <span
                        aria-label="Visitado"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-dsgreen text-white"
                    >
                        <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                )}
                {/* Acá van SOLO las utilidades del ciclo de la visita. Las apps externas no
                    viven en el header: son consultas de contexto del cliente (misma especie
                    que la dirección), y además cuatro chips no entran en una sola fila —
                    envolvían a un punto de quiebre distinto por card. Van en la banda de
                    contexto, debajo de la dirección. */}
                {operable && !resuelto && (
                    <div className="-mr-0.5 -mt-0.5 flex shrink-0 gap-1">
                        {telefonoLimpio && (
                            <a
                                href={`tel:+54${telefonoLimpio.replace(/\D/g, '')}`}
                                onClick={e => e.stopPropagation()}
                                aria-label="Llamar"
                                title="Llamar"
                                className={HEADER_ICON_ONLY}
                            >
                                <Phone className="h-[15px] w-[15px]" strokeWidth={2} />
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => onEstadoVisita(cliente)}
                            className={HEADER_WITH_LABEL}
                        >
                            <Calendar className="h-[13px] w-[13px]" strokeWidth={2} />
                            Reagendar
                        </button>
                    </div>
                )}
            </div>

            <div
                className="text-[14.5px] font-extrabold leading-tight"
                style={{
                    color: resuelto ? '#8A93A6' : '#182645',
                    textDecoration: resuelto ? 'line-through' : 'none',
                }}
            >
                {nombre}
            </div>

            {direccionTexto &&
                (mapsHref ? (
                    <a
                        href={mapsHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs leading-tight text-dsmuted"
                        style={{ background: resuelto ? 'rgba(33,61,130,0.06)' : '#F4F6FA' }}
                    >
                        <MapPin className="h-[13px] w-[13px] shrink-0" strokeWidth={2} />
                        <span className="min-w-0 flex-1 truncate">{direccionTexto}</span>
                        <ChevronRight className="h-[13px] w-[13px] shrink-0" strokeWidth={2.4} />
                    </a>
                ) : (
                    <div className="mt-2 flex items-start gap-1.5 text-xs leading-tight text-dsmuted">
                        <MapPin className="mt-0.5 h-[13px] w-[13px] shrink-0" strokeWidth={2} />
                        <span>{direccionTexto}</span>
                    </div>
                ))}

            {/* Sin `!resuelto`: un cliente ya visitado también tiene pagos que mirar. */}
            {operable && (
                <AccionesExternas
                    cliente={cliente}
                    variante="contexto"
                    onAbrir={onAbrirAppExterna}
                />
            )}

            {/* Resuelto sin visita real (no_visita/reagendada): no hay nada que resumir ni
                ninguna acción que tenga sentido — llamar o reagendar a alguien ya resuelto
                no aplica. Queda solo el pill de estado de más arriba. */}
            {operable && resuelto && cliente.visitaId === null ? null : operable && resuelto ? (
                <div className="mt-2.5 border-t border-[#EDEFF4] pt-2.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrir(cliente)}
                        className="h-11 w-full border-[#D8DEEA] text-[13px] text-dsnavy"
                    >
                        Ver resumen
                    </Button>
                </div>
            ) : operable ? (
                <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#EDEFF4] pt-2.5">
                    {/* Tier 1 — las dos acciones de la visita, con el MISMO peso: el vendedor
                        tanto entra derecho como prepara la propuesta antes, según el cliente.
                        Se distinguen por relleno (outline vs. verde), no por tamaño. */}
                    <div className="flex gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAbrir(cliente)}
                            className="h-11 flex-1 border-[#D8DEEA] text-[13px] text-dsnavy"
                        >
                            <Zap className="h-[14px] w-[14px]" strokeWidth={2} />
                            Propuesta
                        </Button>
                        {puedeIniciar && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => onIniciarVisita(cliente)}
                                className="h-11 flex-1 bg-dsgreen text-[13px] hover:bg-dsgreen/90"
                            >
                                <Play className="h-[14px] w-[14px] fill-current" strokeWidth={0} />
                                Iniciar visita
                            </Button>
                        )}
                    </div>
                    {/* Bloqueado por otra visita: nota informativa, no un control. Va chica y
                        sin caja de botón para que no compita con el tier 1 ni invite al tap. */}
                    {cliente.estado === 'pendiente' && otraVisitaEnCurso && (
                        <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11.5px] font-semibold leading-tight text-[#8A93A6]">
                            <Lock className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                            Cerrá la visita en curso para iniciar otra
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
