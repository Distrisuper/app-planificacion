import { Phone, X } from 'lucide-react'
import { useLlamadoDetalle } from '@/hooks/useAnalitica'
import { ETIQUETA_ESTADO_LLAMADO } from '@/lib/contactos'
import { horaNegocio } from '@/lib/fechas'

interface DetalleLlamadoPanelProps {
    llamadoId: number
    onCerrar: () => void
}

const ETIQUETA_RESULTADO: Record<string, string> = {
    ganado: 'Ganado',
    diferido: 'Diferido',
    perdido: 'Perdido',
    no_ofrecido: 'No ofrecido',
}

const etiqueta = (r: string | null) => (r ? (ETIQUETA_RESULTADO[r] ?? r) : '—')

/** Igual que en el detalle de la visita: los valores tal como se guardaron. */
function resumenValores(valores: Record<string, string | number>): string {
    return Object.entries(valores)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' · ')
}

/** El detalle de un llamado de Televentas. Sin mapa ni distancias: no hay GPS. */
export default function DetalleLlamadoPanel({ llamadoId, onCerrar }: DetalleLlamadoPanelProps) {
    const { data, isLoading, isError } = useLlamadoDetalle(llamadoId)

    return (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                        {data?.nombreCliente ?? 'Detalle del llamado'}
                    </h2>
                    <p className="flex items-center gap-1 text-xs text-sky-700">
                        <Phone aria-hidden className="h-3 w-3" />
                        Llamado de Televentas
                    </p>
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
            {isError && <p className="px-5 py-6 text-sm text-red-700">No se pudo cargar el detalle.</p>}

            {data && (
                <div className="space-y-5 px-5 py-4">
                    <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-slate-500">Hora</dt>
                            <dd className="text-slate-900">{horaNegocio(data.fechaInicio)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Llamó</dt>
                            <dd className="text-slate-900">{data.nombreAutor ?? data.codigoAutor}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500">Resultado</dt>
                            <dd className="text-slate-900">{ETIQUETA_ESTADO_LLAMADO[data.estado]}</dd>
                        </div>
                    </dl>

                    {data.motivos.length > 0 && (
                        <div>
                            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Motivo</p>
                            <ul className="space-y-1 text-sm text-slate-700">
                                {data.motivos.map(m => (
                                    <li key={m}>{m}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {data.ofrecimientos.length > 0 && (
                        <div>
                            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Rubros del llamado</p>
                            <ul className="space-y-2">
                                {data.ofrecimientos.map(o => (
                                    <li key={o.codigo} className="rounded-md border border-slate-200 px-3 py-2">
                                        <span className="text-sm font-medium text-slate-900">{o.descripcion}</span>
                                        {o.marcas.length > 0 && (
                                            <p className="mt-0.5 text-xs text-slate-500">{o.marcas.join(', ')}</p>
                                        )}
                                        {o.motivos.map((m, i) => (
                                            <p key={i} className="mt-1 text-xs text-slate-600">
                                                {m.descripcion} · {etiqueta(m.resultado)}
                                                {resumenValores(m.valores) && ` · ${resumenValores(m.valores)}`}
                                            </p>
                                        ))}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {data.observaciones && (
                        <div>
                            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Observaciones</p>
                            <p className="text-sm text-slate-700">{data.observaciones}</p>
                        </div>
                    )}

                    {data.proximoContacto && (
                        <p className="text-xs text-slate-500">Próximo contacto: {data.proximoContacto}</p>
                    )}
                </div>
            )}
        </aside>
    )
}
