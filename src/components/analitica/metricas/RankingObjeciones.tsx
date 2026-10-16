import { useState } from 'react'
import { useObjecionesPorPersona, useRubrosCatalogo } from '@/hooks/useMetricasEquipo'
import { formatPct } from '@/lib/analiticaFormat'
import { cantidadDe, motivoPrincipal, recortarObjeciones } from '@/lib/objecionesEquipo'
import type { FiltroTipo } from '@/lib/tipoPersona'
import { cn } from '@/lib/utils'
import { BadgeTipo, CLASE_NUM, Cargando, ErrorBloque, Tarjeta } from './ui'

/** Los motivos que se ven de entrada; el resto, plegado (como la tarjeta de Versus). */
const MOTIVOS_VISIBLES = 6
/** Columnas de motivo en la tabla: más que esto no entra en una pantalla de gerencia. */
const MOTIVOS_EN_TABLA = 6

const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

interface RankingObjecionesProps {
    desde: string
    hasta: string
    filtroTipo: FiltroTipo
}

export default function RankingObjeciones({ desde, hasta, filtroTipo }: RankingObjecionesProps) {
    const [rubro, setRubro] = useState<string | undefined>()
    const [elegido, setElegido] = useState<number | null>(null)
    const [todos, setTodos] = useState(false)
    const { data, isLoading, isError, refetch, isPlaceholderData } = useObjecionesPorPersona({ desde, hasta, rubro })
    const { data: rubros } = useRubrosCatalogo()

    const recorte = data ? recortarObjeciones(data, filtroTipo) : null
    const ranking = recorte?.motivos ?? []
    // El elegido sale de este recorte: con otro filtro puede no existir.
    const motivoElegido = ranking.find(m => m.motivoId === elegido) ?? null
    const visibles = todos ? ranking : ranking.filter((m, i) => i < MOTIVOS_VISIBLES || m.motivoId === elegido)
    const ocultos = ranking.length - visibles.length

    // La tabla muestra los motivos más repetidos; el elegido siempre entra.
    const columnas = ranking.slice(0, MOTIVOS_EN_TABLA)
    if (motivoElegido && !columnas.includes(motivoElegido)) columnas.push(motivoElegido)

    // Tocar un motivo arma su ranking: quién lo registra más. Sin motivo, por total.
    const personas = [...(recorte?.personas ?? [])].sort((a, b) =>
        motivoElegido
            ? cantidadDe(b, motivoElegido.motivoId) - cantidadDe(a, motivoElegido.motivoId) || b.total - a.total
            : b.total - a.total,
    )
    const maxCelda = Math.max(1, ...personas.flatMap(p => columnas.map(m => cantidadDe(p, m.motivoId))))

    const cambiarRubro = (valor: string) => {
        setRubro(valor || undefined)
        setElegido(null)
    }

    return (
        // Motivos arriba y ranking abajo, los dos a todo el ancho: al lado, la tabla quedaba
        // angosta y cada fila crecía a 3-4 renglones.
        <div className={cn('space-y-5', isPlaceholderData && 'opacity-60')}>
            <Tarjeta
                titulo="Objeciones"
                subtitulo={
                    recorte && recorte.total > 0 ? (
                        <span className={CLASE_NUM} data-testid="total-objeciones">
                            <b className="text-slate-800">{ENTERO.format(recorte.total)}</b> objeciones ·{' '}
                            {recorte.personas.length} persona{recorte.personas.length === 1 ? '' : 's'}
                        </span>
                    ) : undefined
                }
                derecha={
                    <label className="inline-flex h-8 items-center gap-1 rounded-full bg-slate-100 pl-3 pr-1 text-xs text-slate-600">
                        Rubro:
                        <select
                            aria-label="Rubro"
                            value={rubro ?? ''}
                            onChange={e => cambiarRubro(e.target.value)}
                            className="max-w-[160px] cursor-pointer rounded-full bg-transparent py-1 pr-1 text-xs font-bold text-slate-900 focus:outline-none"
                        >
                            <option value="">Todos</option>
                            {(rubros ?? []).map(r => (
                                <option key={r.code} value={r.code}>
                                    {r.description}
                                </option>
                            ))}
                        </select>
                    </label>
                }
            >
                {isLoading && <Cargando />}
                {isError && <ErrorBloque texto="No se pudieron cargar las objeciones." onReintentar={() => refetch()} />}
                {recorte && ranking.length === 0 && (
                    <p className="py-6 text-sm text-slate-500">Sin objeciones en este período.</p>
                )}
                {ranking.length > 0 && (
                    <div className="flex flex-col">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            {visibles.map(m => (
                                <button
                                    key={m.motivoId}
                                    type="button"
                                    aria-pressed={elegido === m.motivoId}
                                    data-testid={`motivo-${m.motivoId}`}
                                    title={m.descripcion}
                                    onClick={() => setElegido(e => (e === m.motivoId ? null : m.motivoId))}
                                    className={cn(
                                        'flex min-w-0 flex-col rounded-xl border px-3 py-2 text-left transition-colors',
                                        elegido === m.motivoId
                                            ? 'border-dsnavy/40 bg-dsnavy/10 text-dsnavy'
                                            : 'border-slate-200 text-slate-800 hover:bg-slate-50',
                                        elegido !== m.motivoId && Math.round(m.pct * 100) === 0 && 'opacity-60',
                                    )}
                                >
                                    <span className="truncate text-[13px] font-medium">{m.descripcion}</span>
                                    <span className={cn(CLASE_NUM, 'mt-0.5 flex items-baseline gap-1.5')}>
                                        <span className="text-lg font-bold text-dsnavy">{ENTERO.format(m.cantidad)}</span>
                                        <span className="text-xs text-slate-500">{formatPct(m.pct)}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                            <p className="text-xs text-slate-500">Tocá un motivo para ver quién lo registra más.</p>
                            {(ocultos > 0 || todos) && ranking.length > MOTIVOS_VISIBLES && (
                                <button
                                    type="button"
                                    onClick={() => setTodos(t => !t)}
                                    className="h-7 rounded-full px-2 text-xs font-semibold text-dsnavy hover:bg-dsnavy/10"
                                >
                                    {todos ? 'Ver menos' : `Ver ${ocultos} motivos más`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Tarjeta>

            <Tarjeta
                titulo={motivoElegido ? `Ranking · ${motivoElegido.descripcion}` : 'Ranking por persona'}
                subtitulo={
                    motivoElegido
                        ? 'Quién registra más este motivo. El % es sobre las objeciones de cada persona.'
                        : 'Objeciones de cada persona por motivo. El % es sobre las objeciones de cada persona.'
                }
                derecha={
                    motivoElegido && (
                        <button
                            type="button"
                            onClick={() => setElegido(null)}
                            className="h-8 rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                            Ver todos los motivos
                        </button>
                    )
                }
            >
                {personas.length > 0 && (
                    <div className="-mx-5 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead className="border-y border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="w-10 px-3 py-2.5" aria-label="Posición" />
                                    <th className="px-3 py-2.5 text-left font-semibold">Persona</th>
                                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                                    <th className="px-3 py-2.5 text-left font-semibold">Principal</th>
                                    {columnas.map(m => (
                                        <th
                                            key={m.motivoId}
                                            className={cn(
                                                'max-w-[110px] px-3 py-2.5 text-right font-semibold normal-case tracking-normal last:pr-5',
                                                motivoElegido?.motivoId === m.motivoId && 'text-dsnavy',
                                            )}
                                        >
                                            <span className="line-clamp-2">{m.descripcion}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {personas.map((p, i) => {
                                    const principal = motivoPrincipal(p, ranking)
                                    return (
                                        <tr key={`${p.tipo}:${p.codigo}`} data-testid={`fila-objeciones-${p.codigo}`}>
                                            <td className={cn(CLASE_NUM, 'px-3 py-2 text-center text-xs text-slate-400')}>{i + 1}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate font-semibold text-slate-900">{p.nombre || p.codigo}</span>
                                                    <BadgeTipo tipo={p.tipo} />
                                                </div>
                                                {/* El código del vendedor es su alias (FEDE, VTA 1) y repite el nombre. */}
                                                {p.tipo !== 'vendedor' && <p className="text-[11px] text-slate-400">{p.codigo}</p>}
                                            </td>
                                            <td className={cn(CLASE_NUM, 'px-3 py-2 text-right font-bold text-slate-900')}>
                                                {ENTERO.format(p.total)}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-left">
                                                <span className="text-slate-800">{principal?.descripcion ?? '—'}</span>
                                                {principal && p.total > 0 && (
                                                    <span className={cn(CLASE_NUM, 'ml-1.5 text-xs text-slate-400')}>
                                                        {formatPct(cantidadDe(p, principal.motivoId) / p.total)}
                                                    </span>
                                                )}
                                            </td>
                                            {columnas.map(m => {
                                                const c = cantidadDe(p, m.motivoId)
                                                // Más oscuro cuanto más pesa la celda dentro de la tabla.
                                                const peso = c / maxCelda
                                                return (
                                                    <td key={m.motivoId} className="px-2 py-1.5 text-right last:pr-4">
                                                        <span
                                                            className={cn(
                                                                CLASE_NUM,
                                                                'inline-flex min-w-[4.5rem] items-baseline justify-end gap-1.5 whitespace-nowrap rounded-lg px-2 py-1',
                                                                c === 0 && 'text-slate-300',
                                                                motivoElegido?.motivoId === m.motivoId && 'ring-1 ring-dsnavy/30',
                                                            )}
                                                            style={c > 0 ? { backgroundColor: `rgba(33, 61, 130, ${(0.06 + peso * 0.3).toFixed(3)})` } : undefined}
                                                        >
                                                            <span className="font-semibold text-slate-900">{c > 0 ? ENTERO.format(c) : '—'}</span>
                                                            {c > 0 && <span className="text-[10.5px] text-slate-600">{formatPct(c / p.total)}</span>}
                                                        </span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {recorte && personas.length === 0 && (
                    <p className="py-6 text-sm text-slate-500">Nadie registró objeciones en este período.</p>
                )}
            </Tarjeta>
        </div>
    )
}
