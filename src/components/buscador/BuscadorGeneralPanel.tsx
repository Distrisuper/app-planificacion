import { ChevronRight } from 'lucide-react'
import { useBuscarEnCartera } from '@/hooks/useBuscador'
import { etiquetaEstado } from './etiquetas'

interface BuscadorGeneralPanelProps {
    /** El texto que vive en el campo del header — este panel no tiene input propio. */
    texto: string
    /** Navega al preview de esa zona (mismo mecanismo que ya usa `AgendaSemanaPage`). */
    onVerZona: (semana: number) => void
}

/**
 * Buscador general, de SOLO LECTURA, sobre toda la cartera del vendedor.
 *
 * No es un modal: mientras se busca, este panel ocupa el lugar del board y el campo
 * vive en el header (`AppHeader.buscando`). Un sheet encima de la agenda obligaba a
 * cerrarlo para ver algo, y encima repetía la lupa del header con otra semántica.
 *
 * Deliberadamente NO comparte componente con `BuscadorDiaSheet`: acá tocar un resultado
 * nunca escribe nada, solo lleva a mirar la zona donde el cliente está.
 */
export function BuscadorGeneralPanel({ texto, onVerZona }: BuscadorGeneralPanelProps) {
    const { data: resultados = [], buscando } = useBuscarEnCartera(texto)
    const corto = texto.trim().length < 2

    return (
        <div className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-5 pt-3">
            {corto && (
                <p className="px-1 pt-8 text-center text-sm leading-relaxed text-dsmuted">
                    Buscá cualquier cliente de tu cartera
                    <br />
                    para ver dónde está en la vuelta.
                </p>
            )}
            {!corto && buscando && <p className="px-1 text-sm text-dsmuted">Buscando…</p>}
            {!corto &&
                resultados.map(r => (
                    <button
                        key={r.codigoParticularCliente}
                        type="button"
                        // Sin zona no hay adónde ir: el cliente no está en esta vuelta. Se
                        // sigue mostrando —saber que NO está planificado es el dato— pero
                        // no finge ser navegable.
                        disabled={r.semana === null}
                        onClick={() => r.semana !== null && onVerZona(r.semana)}
                        className="flex w-full items-center gap-2 rounded-[13px] border border-dsline bg-white px-3.5 py-3 text-left shadow-sm disabled:opacity-70"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-bold text-[#182645]">
                                {r.nombreCliente}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] font-medium text-dsmuted">
                                {etiquetaEstado(r)}
                            </span>
                        </span>
                        {r.semana !== null && (
                            <ChevronRight
                                className="h-4 w-4 shrink-0 text-[#B4BCCB]"
                                strokeWidth={2.4}
                            />
                        )}
                    </button>
                ))}
            {!corto && !buscando && resultados.length === 0 && (
                <p className="px-1 pt-8 text-center text-sm text-dsmuted">
                    Ningún cliente de tu cartera coincide.
                </p>
            )}
        </div>
    )
}
