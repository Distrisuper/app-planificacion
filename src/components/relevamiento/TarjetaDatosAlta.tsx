import type { ReactNode } from 'react'
import { AlertTriangle, Check, ChevronRight } from 'lucide-react'

interface TarjetaDatosAltaProps {
    /** La ficha (especialidad, personas, facturación) tiene obligatorios sin cargar. */
    fichaPendiente: boolean
    /** Campos del relevamiento con valor, sobre el total del esquema. null = esquema en vuelo. */
    progreso: { cargados: number; total: number } | null
    /** Sin los dos handlers no se dibujan los renglones (queda sólo `children`). */
    onAbrirFicha?: () => void
    onAbrirRelevamiento?: () => void
    /** Bloque al pie de la tarjeta: VisitaSheet pone ahí "¿Con quién hablaste hoy?". */
    children?: ReactNode
}

/**
 * "Datos del comercio" de la visita de alta, arriba de todo del cuerpo de VisitaSheet. En un
 * alta cargar los datos es la mitad del trabajo, y un chip de 28px en el header al lado de la
 * salida negativa no lo decía — ni mostraba qué faltaba. Dos renglones, cada uno su puerta,
 * y al pie lo que el vendedor quiera sumar (el contacto de hoy):
 *
 * - **Ficha** (obligatoria para cerrar): ámbar mientras falte, verde cuando está.
 * - **Datos para el alta** (opcional): cuánto del relevamiento está cargado.
 *
 * Qué abre cada renglón lo decide VisitaFlow.
 */
export default function TarjetaDatosAlta({
    fichaPendiente,
    progreso,
    onAbrirFicha,
    onAbrirRelevamiento,
    children,
}: TarjetaDatosAltaProps) {
    const conRenglones = !!onAbrirFicha && !!onAbrirRelevamiento
    return (
        <section
            aria-label="Datos del comercio"
            className={`mb-5 overflow-hidden rounded-xl border-[1.5px] ${
                fichaPendiente ? 'border-amber-300 bg-amber-50/60' : 'border-[#E4E8F0] bg-white'
            }`}
        >
            <h3 className="px-3 pt-2.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">Datos del comercio</h3>
            {conRenglones && (
                <>
                    <button type="button" onClick={onAbrirFicha} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                        {fichaPendiente ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.4} />
                        ) : (
                            <Check className="h-4 w-4 shrink-0 text-dsgreen" strokeWidth={2.8} />
                        )}
                        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-[#182645]">Ficha del comercio</span>
                        <span className={`shrink-0 text-[11.5px] font-bold ${fichaPendiente ? 'text-amber-700' : 'text-dsgreen'}`}>
                            {fichaPendiente ? 'Falta · obligatoria' : 'Completa'}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </button>
                    <button
                        type="button"
                        onClick={onAbrirRelevamiento}
                        className="flex w-full items-center gap-2.5 border-t border-[#EEF1F6] px-3 py-2.5 text-left"
                    >
                        <span
                            aria-hidden
                            className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                                progreso && progreso.cargados > 0 ? 'border-dsnavy bg-dsnavy/15' : 'border-[#C9D2E3]'
                            }`}
                        />
                        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-[#182645]">Datos para el alta</span>
                        <span className="shrink-0 text-[11.5px] font-bold text-dsmuted">
                            {progreso ? `${progreso.cargados} de ${progreso.total}` : 'Opcional'}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </button>
                </>
            )}
            {children && (
                <div className={`bg-[#FAFBFD] ${conRenglones ? 'border-t border-[#EEF1F6]' : ''}`}>{children}</div>
            )}
        </section>
    )
}
