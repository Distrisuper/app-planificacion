import { useObjeciones } from '@/hooks/useAnalitica'
import { formatPct } from '@/lib/analiticaFormat'
import type { ResultadoMotivo } from '@/types/planificacion'

interface ObjecionesMercadoProps {
    desde: string
    hasta: string
}

/** El color habla del resultado comercial, no del volumen: una objeción frecuente
 *  que termina en pedido no es un problema. */
const BORDE_POR_RESULTADO: Record<string, string> = {
    ganado: 'border-l-emerald-400',
    diferido: 'border-l-amber-400',
    perdido: 'border-l-red-400',
    no_ofrecido: 'border-l-slate-300',
}

const borde = (resultado: ResultadoMotivo | null) =>
    BORDE_POR_RESULTADO[resultado ?? ''] ?? 'border-l-slate-300'

export default function ObjecionesMercado({ desde, hasta }: ObjecionesMercadoProps) {
    const { data, isLoading } = useObjeciones({ desde, hasta })

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Objeciones del mercado</h2>
            <p className="mt-0.5 text-xs text-slate-500">
                Motivos cargados por rubro en el rango elegido.
            </p>

            {isLoading && <p className="mt-4 text-sm text-slate-500">Cargando…</p>}

            {data && data.motivos.length === 0 && (
                <p className="mt-4 text-sm text-slate-500">
                    Sin motivos cargados en este rango.
                </p>
            )}

            {data && data.motivos.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                    {data.motivos.map(m => (
                        <li
                            key={m.motivoId}
                            data-testid={`objecion-${m.motivoId}`}
                            className={`flex items-center justify-between border-l-4 bg-slate-50 px-3 py-2 ${borde(m.resultado)}`}
                        >
                            <span className="text-sm text-slate-800">{m.descripcion}</span>
                            <span className="flex items-center gap-4 text-sm tabular-nums">
                                <span className="text-slate-500">{m.cantidad}</span>
                                <span className="w-12 text-right font-medium text-slate-900">
                                    {formatPct(m.pct)}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
