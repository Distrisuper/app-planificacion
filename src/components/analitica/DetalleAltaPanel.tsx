import { X } from 'lucide-react'
import { camposPorSeccion } from '@/lib/camposAlta'
import { ETIQUETA_ESTADO_ALTA, valorVisible } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

interface DetalleAltaPanelProps {
    alta: IAltaRelevada
    esquema: IEsquemaAlta
    onCerrar: () => void
}

const o = (v: string | null | undefined) => (v && v !== '' ? v : '—')

/**
 * Solo lectura: `pl_rotacion_cliente.detalle` se congela al cerrar la visita y gerencia no
 * edita datos del vendedor. Muestra TODOS los campos del esquema, vacíos incluidos, en las
 * mismas secciones que ve el vendedor — es la misma ficha desde el otro lado.
 */
export default function DetalleAltaPanel({ alta, esquema, onCerrar }: DetalleAltaPanelProps) {
    const titulo = valorVisible(esquema, alta, 'nombre') ?? 'Cliente nuevo'
    return (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
                    <p className="text-xs text-slate-500">
                        {alta.vendedor.nombre || alta.vendedor.codigo} · {ETIQUETA_ESTADO_ALTA[alta.estado]}
                        {alta.fechaVisita ? ` · ${alta.fechaVisita}` : ''} · {alta.camposCargados} de {alta.camposTotal} datos
                    </p>
                </div>
                <button type="button" onClick={onCerrar} aria-label="Cerrar"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-5 px-5 py-4">
                {camposPorSeccion(esquema).map(({ seccion, campos }) => (
                    <section key={seccion.clave}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{seccion.titulo}</h3>
                        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                            {campos.map(c => (
                                <div key={c.clave} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                                    <dt className="text-slate-500">{c.etiqueta}</dt>
                                    <dd className="whitespace-pre-wrap break-words text-slate-900">{o(valorVisible(esquema, alta, c.clave))}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto de la visita</h3>
                    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                            <dt className="text-slate-500">Con quién habló</dt>
                            <dd className="text-slate-900">{o(alta.contacto?.contacto)}</dd>
                        </div>
                        <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                            <dt className="text-slate-500">Cumpleaños</dt>
                            <dd className="text-slate-900">{o(alta.contacto?.fechaNacimiento)}</dd>
                        </div>
                    </dl>
                </section>
            </div>
        </aside>
    )
}
