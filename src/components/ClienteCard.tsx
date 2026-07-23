import { Check } from 'lucide-react'
import type { IAgendaClient } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    onAbrir: (codigo: string) => void
    onNoVisita?: (codigo: string) => void
}

export default function ClienteCard({ cliente, onAbrir, onNoVisita }: ClienteCardProps) {
    const resuelto = !!cliente.resuelto
    return (
        <div
            onClick={() => !resuelto && onAbrir(cliente.codigoParticularCliente)}
            className={`rounded-xl border p-3 ${resuelto ? 'border-dsgreen/40 bg-dsgreen/5' : 'border-slate-200 bg-white'}`}
        >
            <div className="flex items-start justify-between">
                {cliente.descripcionSemana && (
                    <div className="text-xs font-semibold text-dsgreen">{cliente.descripcionSemana}</div>
                )}
                {resuelto && <Check className="h-5 w-5 rounded-full bg-dsgreen p-0.5 text-white" />}
            </div>
            <div className={`mt-1 font-bold text-dsnavy ${resuelto ? 'line-through opacity-70' : ''}`}>
                {cliente.nombreCliente}
            </div>
            {cliente.barrio && <div className="mt-1 text-xs text-dsmuted">📍 {cliente.barrio}</div>}
            {!resuelto && (
                <button
                    onClick={e => {
                        e.stopPropagation()
                        onAbrir(cliente.codigoParticularCliente)
                    }}
                    className="mt-3 w-full rounded-lg bg-dsnavy py-2 text-sm font-semibold text-white"
                >
                    Iniciar visita
                </button>
            )}
            {!resuelto && (
                <button
                    onClick={e => {
                        e.stopPropagation()
                        onNoVisita?.(cliente.codigoParticularCliente)
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-dsmuted"
                >
                    Reagendar / No visito
                </button>
            )}
        </div>
    )
}
