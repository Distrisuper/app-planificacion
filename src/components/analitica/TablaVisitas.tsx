import { claseDistancia, formatDistancia, formatDuracion, peorDistancia } from '@/lib/analiticaFormat'
import { Phone } from 'lucide-react'
import { horaNegocio } from '@/lib/fechas'
import { esLlamado, ETIQUETA_ESTADO_LLAMADO } from '@/lib/contactos'
import type { IContactoFila, IContactoLlamado, IVisitaFila } from '@/types/analitica'
import type { ResultadoMotivo } from '@/types/planificacion'

interface TablaVisitasProps {
    /** Filas de /visitas o del feed de contactos (visitas y llamados mezclados). */
    visitas: (IVisitaFila | IContactoFila)[]
    onElegirVisita: (visitaId: number) => void
    onElegirLlamado?: (llamadoId: number) => void
    /** De `useCriterioVisita`, que la página ya tiene. Sin él se pinta con el respaldo
     *  (TOLERANCIA_METROS) mientras carga. */
    toleranciaMetros?: number
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

export default function TablaVisitas({ visitas, onElegirVisita, onElegirLlamado, toleranciaMetros }: TablaVisitasProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Inicio</th>
                        <th className="px-3 py-2 text-right">Duración</th>
                        <th className="px-3 py-2 text-right">Dist.</th>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    {visitas.map(v => esLlamado(v) ? (
                        <FilaLlamado key={`l-${v.llamadoId}`} l={v} onElegir={onElegirLlamado} />
                    ) : (
                        <tr
                            key={`v-${v.visitaId}`}
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
                                            claseDistancia(v.distanciaInicioMetros, v.distanciaFinMetros, toleranciaMetros)
                                        ]
                                    }
                                >
                                    {formatDistancia(peorDistancia(v.distanciaInicioMetros, v.distanciaFinMetros))}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                                {v.codigoParticularCliente}
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

/** Un llamado de Televentas al cliente: sin duración ni distancia (no hay GPS). Se marca
 *  como llamado al lado del cliente, con quién llamó y el desenlace. */
function FilaLlamado({ l, onElegir }: { l: IContactoLlamado; onElegir?: (llamadoId: number) => void }) {
    return (
        <tr
            onClick={() => onElegir?.(l.llamadoId)}
            className="cursor-pointer border-b border-slate-100 bg-sky-50/40 hover:bg-blue-50"
        >
            <td className="px-3 py-2 text-slate-600">{l.fecha}</td>
            <td className="px-3 py-2 text-slate-600">{horaNegocio(l.fechaInicio)}</td>
            <td className="px-3 py-2 text-right text-slate-400">—</td>
            <td className="px-3 py-2 text-right text-slate-400">—</td>
            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                {l.codigoParticularCliente}
            </td>
            <td className="px-3 py-2 text-slate-900">
                {l.nombreCliente}
                <span
                    data-testid={`canal-llamado-${l.llamadoId}`}
                    className="mt-0.5 flex items-center gap-1 text-xs text-sky-700"
                >
                    <Phone aria-hidden className="h-3 w-3" />
                    Llamado · {ETIQUETA_ESTADO_LLAMADO[l.estado]} · {l.nombreAutor ?? l.codigoAutor}
                </span>
            </td>
            <td className="px-3 py-2 text-slate-600">{l.motivos.length > 0 ? l.motivos.join(', ') : '—'}</td>
            <td
                data-testid={`resultado-llamado-${l.llamadoId}`}
                className={`px-3 py-2 ${l.resultado ? COLOR_RESULTADO[l.resultado] : 'text-slate-400'}`}
            >
                {etiquetaResultado(l.resultado)}
            </td>
        </tr>
    )
}
