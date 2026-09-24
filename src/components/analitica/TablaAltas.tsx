import { ETIQUETA_ESTADO_ALTA, valorVisible } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { EstadoCicloCliente, IEsquemaAlta } from '@/types/planificacion'

interface TablaAltasProps {
    filas: IAltaRelevada[]
    esquema: IEsquemaAlta
    onElegir: (alta: IAltaRelevada) => void
}

const CLASE_ESTADO: Record<EstadoCicloCliente, string> = {
    pendiente: 'bg-slate-100 text-slate-600',
    en_curso: 'bg-amber-100 text-amber-800',
    visitada: 'bg-emerald-100 text-emerald-700',
    no_visita: 'bg-slate-100 text-slate-600',
}

const o = (v: string | null | undefined) => (v && v !== '' ? v : '—')

/** Las columnas "Comercio" y "Localidad" son las claves `nombre` y `localidad` si el esquema
 *  las trae; si un esquema futuro no tuviera `localidad`, la columna sale con —. */
export default function TablaAltas({ filas, esquema, onElegir }: TablaAltasProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Comercio</th>
                        <th className="px-3 py-2 text-left">Localidad</th>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-right">Completo</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map(a => (
                        <tr key={a.rotacionClienteId} onClick={() => onElegir(a)}
                            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50">
                            <td className="px-3 py-2 font-medium text-slate-900">{valorVisible(esquema, a, 'nombre') ?? 'Cliente nuevo'}</td>
                            <td className="px-3 py-2 text-slate-600">{o(valorVisible(esquema, a, 'localidad'))}</td>
                            <td className="px-3 py-2 text-slate-600">{a.vendedor.nombre || a.vendedor.codigo}</td>
                            <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[a.estado]}`}>
                                    {ETIQUETA_ESTADO_ALTA[a.estado]}
                                </span>
                                {/* Lo que falta es lo visitado SIN esta marca: el alta ya se
                                    dio de alta en Flexxus y su ficha pasó al cliente. */}
                                {a.vinculo && (
                                    <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                        En Flexxus · {a.vinculo.codigoParticularCliente}
                                    </span>
                                )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{o(a.fechaVisita)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{a.camposCargados}/{a.camposTotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
