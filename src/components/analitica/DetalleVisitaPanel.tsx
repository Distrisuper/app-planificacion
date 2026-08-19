import { X } from 'lucide-react'
import MapaVisita from './MapaVisita'
import { useVisitaDetalle } from '@/hooks/useAnalitica'
import { claseDistancia, formatDistancia, formatDuracion, TIPO_LABEL } from '@/lib/analiticaFormat'
import { resumenAlcance } from '@/lib/alcance'
import { horaNegocio } from '@/lib/fechas'
import type { ResultadoMotivo } from '@/types/planificacion'

interface DetalleVisitaPanelProps {
    visitaId: number
    onCerrar: () => void
}

const ETIQUETA_RESULTADO: Record<string, string> = {
    ganado: 'Ganado',
    diferido: 'Diferido',
    perdido: 'Perdido',
    no_ofrecido: 'No ofrecido',
}

const CLASE_DISTANCIA: Record<string, string> = {
    ok: 'text-emerald-600',
    alerta: 'text-red-600',
    neutro: 'text-slate-400',
}

/** Nunca `slice(11, 16)`: el instante viene en ISO UTC, así que cortar el string
 *  mostraba la hora de Greenwich (+3 sobre la real). Ver `horaNegocio`. */
const hora = horaNegocio

const etiqueta = (r: ResultadoMotivo | null) => (r ? ETIQUETA_RESULTADO[r] : '—')

/** Los valores guardados, en una línea. Se listan tal cual vinieron y NO se piden al módulo
 *  del motivo: el módulo dice qué preguntar hoy, y esto es historia — un campo que se sacó
 *  después tiene que seguir viéndose. Mismo criterio que `incluirInactivos` en el backend. */
function resumenValores(valores: Record<string, string | number | null>): string {
    return Object.entries(valores)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' · ')
}

export default function DetalleVisitaPanel({ visitaId, onCerrar }: DetalleVisitaPanelProps) {
    const { data, isLoading, isError } = useVisitaDetalle(visitaId)

    return (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                        {data?.nombreCliente ?? 'Detalle de la visita'}
                    </h2>
                    {data?.direccion && <p className="text-xs text-slate-500">{data.direccion}</p>}
                </div>
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Cerrar"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {isLoading && <p className="px-5 py-6 text-sm text-slate-500">Cargando…</p>}
            {isError && (
                <p className="px-5 py-6 text-sm text-red-700">No se pudo cargar el detalle.</p>
            )}

            {data && (
                <div className="space-y-5 px-5 py-4">
                    <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-slate-500">Inicio</dt>
                            <dd className="text-slate-900">{hora(data.fechaInicio)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Fin</dt>
                            <dd className="text-slate-900">{hora(data.fechaFin)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Duración</dt>
                            <dd className="text-slate-900">{formatDuracion(data.duracionMin)}</dd>
                        </div>
                    </dl>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                            Ubicación —{' '}
                            <span className={CLASE_DISTANCIA[claseDistancia(data.distanciaMetros)]}>
                                {formatDistancia(data.distanciaMetros)}
                            </span>
                        </p>
                        {data.coordCliente ? (
                            <MapaVisita
                                coordInicio={data.coordInicio}
                                coordFinal={data.coordFinal}
                                coordCliente={data.coordCliente}
                            />
                        ) : (
                            <p className="rounded-md bg-slate-50 px-3 py-4 text-xs text-slate-500">
                                Sin coordenadas del cliente: la visita no se puede verificar.
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                            Rubros de la visita
                        </p>
                        <ul className="space-y-2">
                            {data.ofrecimientos.map(r => (
                                <li
                                    key={`${r.tipo}:${r.codigo}`}
                                    data-testid={`ofrecimiento-${r.tipo}-${r.codigo}`}
                                    className="rounded-md border border-slate-200 px-3 py-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-sm font-medium text-slate-900">
                                                {r.descripcion}
                                            </span>
                                            {r.tipo !== 'rubro' && (
                                                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                                    {TIPO_LABEL[r.tipo]}
                                                </span>
                                            )}
                                        </div>
                                        {!r.resuelto && (
                                            <span className="shrink-0 text-xs text-amber-600">
                                                Sin resolver
                                            </span>
                                        )}
                                    </div>
                                    {r.alcance.length > 0 && (
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            {resumenAlcance(r.alcance)}
                                        </p>
                                    )}
                                    {r.motivos.map((m, i) => (
                                        <p key={i} className="mt-1 text-xs text-slate-600">
                                            {m.descripcion} · {etiqueta(m.resultado)}
                                            {resumenValores(m.valores) && ` · ${resumenValores(m.valores)}`}
                                        </p>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </aside>
    )
}
