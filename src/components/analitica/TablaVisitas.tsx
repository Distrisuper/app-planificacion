import { claseDistancia, formatDistancia, formatDuracion, peorDistancia } from '@/lib/analiticaFormat'
import { horaNegocio } from '@/lib/fechas'
import type { IVisitaFila } from '@/types/analitica'
import type { ResultadoMotivo } from '@/types/planificacion'

interface TablaVisitasProps {
    visitas: IVisitaFila[]
    onElegirVisita: (visitaId: number) => void
}

const ETIQUETA_RESULTADO: Record<string, string> = {
    ganado: 'Ganado',
    diferido: 'Diferido',
    perdido: 'Perdido',
    no_ofrecido: 'No ofrecido',
}

const COLOR_RESULTADO: Record<string, string> = {
    ganado: 'text-emerald-700',
    diferido: 'text-amber-700',
    perdido: 'text-red-700',
    no_ofrecido: 'text-slate-500',
}

const CLASE_DISTANCIA: Record<string, string> = {
    ok: 'text-emerald-600 font-medium',
    alerta: 'text-red-600 font-medium',
    // Sin dato: gris, nunca rojo. La visita no es verificable, no es incorrecta.
    neutro: 'text-slate-400',
}

const etiquetaResultado = (r: ResultadoMotivo | null) => (r ? ETIQUETA_RESULTADO[r] : '—')

export default function TablaVisitas({ visitas, onElegirVisita }: TablaVisitasProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Inicio</th>
                        <th className="px-3 py-2 text-right">Duración</th>
                        <th className="px-3 py-2 text-right">Dist.</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    {visitas.map(v => (
                        <tr
                            key={v.visitaId}
                            onClick={() => onElegirVisita(v.visitaId)}
                            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50"
                        >
                            <td className="px-3 py-2 text-slate-600">{v.fecha}</td>
                            <td className="px-3 py-2 text-slate-600">
                                {horaNegocio(v.fechaInicio)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">
                                {formatDuracion(v.duracionMin)}
                            </td>
                            <td className="px-3 py-2 text-right">
                                <span
                                    className={
                                        CLASE_DISTANCIA[
                                            claseDistancia(v.distanciaInicioMetros, v.distanciaFinMetros)
                                        ]
                                    }
                                >
                                    {formatDistancia(peorDistancia(v.distanciaInicioMetros, v.distanciaFinMetros))}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-slate-900">{v.nombreCliente}</td>
                            <td className="px-3 py-2 text-slate-600">
                                {v.motivos.length > 0 ? v.motivos.join(', ') : '—'}
                            </td>
                            <td
                                data-testid={`resultado-${v.visitaId}`}
                                className={`px-3 py-2 ${v.resultado ? COLOR_RESULTADO[v.resultado] : 'text-slate-400'}`}
                            >
                                {etiquetaResultado(v.resultado)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
