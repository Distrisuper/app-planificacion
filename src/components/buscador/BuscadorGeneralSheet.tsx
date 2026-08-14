import { useState } from 'react'
import { Search } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { useBuscarEnCartera } from '@/hooks/useBuscador'
import type { IResultadoBuscadorGeneral } from '@/types/planificacion'

const DIA_NOMBRE = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']

function diaLabel(dia: number | null): string {
    if (dia === null) return ''
    return DIA_NOMBRE[dia - 1] ?? `día ${dia}`
}

function etiquetaEstado(r: IResultadoBuscadorGeneral): string {
    switch (r.estado) {
        case 'pendiente':
            return `Pendiente el ${diaLabel(r.dia)} en ${r.semana !== null ? `zona ${r.semana}` : ''}`
        case 'visitado':
            return `Visitado el ${r.fecha ?? ''}`
        case 'no_visita':
            return `No visité — ${r.motivo ?? 'sin motivo'}`
        case 'sin_plan':
            return 'No está planificado esta vuelta'
    }
}

interface BuscadorGeneralSheetProps {
    open: boolean
    onClose: () => void
    /** Navega al preview de esa zona (mismo mecanismo que ya usa `AgendaSemanaPage` para
     *  ver otra semana de la rotación) — sin UI de detalle nueva. */
    onVerZona: (semana: number) => void
}

/**
 * Buscador de solo lectura sobre TODA la cartera de la rotación (spec 2026-08-12,
 * extensión 2026-08-13). Deliberadamente NO comparte estado ni componente con
 * `BuscadorDiaSheet`: acá tocar un resultado nunca escribe nada, solo navega.
 */
export function BuscadorGeneralSheet({ open, onClose, onVerZona }: BuscadorGeneralSheetProps) {
    const [texto, setTexto] = useState('')
    const { data: resultados = [], isFetching } = useBuscarEnCartera(texto)

    return (
        <BottomSheet open={open} onClose={onClose} title="Buscar en toda la rotación" altura="hasta-completa">
            <div className="flex flex-col gap-2">
                <div className="relative mb-1">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                        strokeWidth={2.4}
                    />
                    <input
                        className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                        placeholder="Nombre del cliente"
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        autoFocus
                    />
                </div>
                {isFetching && <p className="px-1 text-sm text-dsmuted">Buscando…</p>}
                <div className="flex flex-col gap-1.5">
                    {resultados.map(r => (
                        <button
                            key={r.codigoParticularCliente}
                            type="button"
                            disabled={r.semana === null}
                            onClick={() => {
                                if (r.semana === null) return
                                onVerZona(r.semana)
                                onClose()
                            }}
                            className="flex w-full flex-col items-start gap-0.5 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left disabled:opacity-70"
                        >
                            <span className="text-sm font-bold text-[#3B4560]">{r.nombreCliente}</span>
                            <span className="text-xs text-dsmuted">{etiquetaEstado(r)}</span>
                        </button>
                    ))}
                    {texto.trim().length >= 2 && !isFetching && resultados.length === 0 && (
                        <div className="py-6 text-center text-sm text-dsmuted">Sin resultados</div>
                    )}
                </div>
            </div>
        </BottomSheet>
    )
}
