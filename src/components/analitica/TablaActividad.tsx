import { claseDistancia, formatDistancia, formatDuracion } from '@/lib/analiticaFormat'
import { horaNegocio } from '@/lib/fechas'
import type { IVisitaFila } from '@/types/analitica'
import type { ResultadoMotivo } from '@/types/planificacion'

interface TablaActividadProps {
    filas: IVisitaFila[]
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

interface Estado {
    texto: string
    clase: string
}

/** El estado sale del `tipo` y recién después del `fechaFin`. */
function estadoDe(fila: IVisitaFila): Estado {
    if (fila.tipo === 'no_visita') return { texto: 'No visitó', clase: 'bg-slate-100 text-slate-600' }
    if (fila.fechaFin === null) return { texto: 'En curso', clase: 'bg-amber-100 text-amber-800' }
    return { texto: 'Cerrada', clase: 'bg-emerald-100 text-emerald-700' }
}

const etiquetaResultado = (r: ResultadoMotivo | null) => (r ? ETIQUETA_RESULTADO[r] : '—')

export default function TablaActividad({ filas, onElegirVisita }: TablaActividadProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Hora</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-right">Duración</th>
                        <th className="px-3 py-2 text-right">Dist.</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map(f => {
                        const estado = estadoDe(f)
                        return (
                            <tr
                                key={f.visitaId}
                                onClick={() => onElegirVisita(f.visitaId)}
                                className="cursor-pointer border-b border-slate-100 hover:bg-blue-50"
                            >
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                    {horaNegocio(f.fechaInicio)}
                                    <span className="ml-2 text-xs text-slate-400">{f.fecha}</span>
                                </td>
                                <td className="px-3 py-2">
                                    <span
                                        data-testid={`estado-${f.visitaId}`}
                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.clase}`}
                                    >
                                        {estado.texto}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-slate-700">{f.nombreVendedor}</td>
                                <td className="px-3 py-2 text-slate-900">{f.nombreCliente}</td>
                                <td className="px-3 py-2 text-right text-slate-700">
                                    {formatDuracion(f.duracionMin)}
                                </td>
                                <td
                                    data-testid={`distancia-${f.visitaId}`}
                                    className={`px-3 py-2 text-right ${CLASE_DISTANCIA[claseDistancia(f.distanciaMetros)]}`}
                                >
                                    {formatDistancia(f.distanciaMetros)}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                    {f.motivos.length > 0 ? f.motivos.join(', ') : '—'}
                                </td>
                                <td
                                    className={`px-3 py-2 ${f.resultado ? COLOR_RESULTADO[f.resultado] : 'text-slate-400'}`}
                                >
                                    {etiquetaResultado(f.resultado)}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
