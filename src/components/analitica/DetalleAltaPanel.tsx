import { useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { camposPorSeccion } from '@/lib/camposAlta'
import { ETIQUETA_ESTADO_ALTA, valorVisible } from '@/lib/altasCsv'
import VinculoFlexxus from '@/components/analitica/VinculoFlexxus'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

interface DetalleAltaPanelProps {
    alta: IAltaRelevada
    esquema: IEsquemaAlta
    onCerrar: () => void
    /** Vincular con el cliente de Flexxus. Devuelve el mensaje de error, o null si salió bien. */
    onVincular?: (codigo: string) => Promise<string | null>
}

const FILA = 'grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm'

/**
 * Una fila `etiqueta → valor`. Con valor, el valor ES un botón que lo copia: administración
 * carga estos datos a mano en el ERP, campo por campo, y seleccionar con el mouse un `<dd>`
 * de un panel angosto es justo el gesto que hace perder el dato de al lado. Se copia lo que
 * se VE (un catálogo va por su descripción, igual que el CSV), no el código guardado.
 * Sin valor no hay botón: no hay nada que copiar, y un target muerto se toca igual.
 */
function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
    return (
        <div className={FILA}>
            <dt className="text-slate-500">{etiqueta}</dt>
            <dd>
                {valor
                    ? <ValorCopiable etiqueta={etiqueta} valor={valor} />
                    : <span className="text-slate-400">—</span>}
            </dd>
        </div>
    )
}

const CONFIRMACION_MS = 1500

function ValorCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
    const [copiado, setCopiado] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    async function copiar() {
        // El portapapeles puede no existir (contexto inseguro) o estar denegado por permisos:
        // ahí no se confirma nada, porque no se copió nada.
        try {
            await navigator.clipboard.writeText(valor)
        } catch {
            return
        }
        setCopiado(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopiado(false), CONFIRMACION_MS)
    }

    return (
        <button type="button" onClick={copiar} aria-label={`Copiar ${etiqueta}`}
            className="group flex w-full items-start gap-2 text-left">
            <span className="whitespace-pre-wrap break-words text-slate-900">{valor}</span>
            {copiado ? (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Copiado
                </span>
            ) : (
                <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
            )}
        </button>
    )
}

/**
 * Solo lectura: `pl_rotacion_cliente.detalle` se congela al cerrar la visita y gerencia no
 * edita datos del vendedor. Muestra TODOS los campos del esquema, vacíos incluidos, en las
 * mismas secciones que ve el vendedor — es la misma ficha desde el otro lado.
 */
export default function DetalleAltaPanel({ alta, esquema, onCerrar, onVincular }: DetalleAltaPanelProps) {
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
                {/* Arriba de todo: es lo único accionable del panel, y lo último que se hace
                    con un alta (después de cargarla en Flexxus con los datos de abajo). */}
                <VinculoFlexxus alta={alta} onVincular={onVincular} />
                {camposPorSeccion(esquema).map(({ seccion, campos }) => (
                    <section key={seccion.clave}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{seccion.titulo}</h3>
                        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                            {campos.map(c => (
                                <FilaDato key={c.clave} etiqueta={c.etiqueta} valor={valorVisible(esquema, alta, c.clave)} />
                            ))}
                        </dl>
                    </section>
                ))}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto de la visita</h3>
                    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        <FilaDato etiqueta="Con quién habló" valor={alta.contacto?.contacto} />
                        <FilaDato etiqueta="Cumpleaños" valor={alta.contacto?.fechaNacimiento} />
                    </dl>
                </section>
            </div>
        </aside>
    )
}
