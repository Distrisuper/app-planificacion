import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import AccountMenu from '@/components/AccountMenu'
import BannerPrueba, { ALTO_BANNER_PRUEBA } from '@/components/prueba/BannerPrueba'
import { useAuth } from '@/context/AuthContext'
import { useMisMetricas } from '@/hooks/useMisMetricas'
import { nombreMes } from '@/lib/fechas'
import {
    formatEntero,
    formatHoras,
    formatMillones,
    formatPct,
    formatVariacion,
    rangoDelMes,
    razon,
    tonoCumplimiento,
    variacion,
    type Tono,
} from '@/lib/misMetricas'
import { estaProbando } from '@/lib/roles'
import type { IMisMetricas } from '@/types/misMetricas'

/** Hasta dónde se puede ir para atrás con ‹. Más de un año no tiene MMAA contra qué
 *  compararse de forma útil, y el vendedor no lo necesita para su trabajo diario. */
const MESES_HACIA_ATRAS = 12

const BADGE: Record<Tono, string> = {
    ok: 'bg-dsgreen text-white',
    medio: 'bg-[#F59E0B] text-white',
    bajo: 'bg-dsred text-white',
    neutro: 'bg-[#E7E9F0] text-dsmuted',
}

const claseVariacion = (v: number | null) =>
    v === null ? 'text-dsmuted' : v < 0 ? 'text-dsred' : 'text-dsgreen'

/**
 * Métricas del vendedor: su productividad del mes contra el objetivo de `pl_objetivo`, y
 * sus ventas contra el mismo período del año anterior (MMAA). Solo sus números: sin
 * ranking, sin equipo. Spec 2026-09-28-tabs-vendedor-metricas-design.md.
 */
export default function MetricasPage() {
    const { user, logout, capacidades } = useAuth()
    const probando = estaProbando(capacidades)
    const hoy = new Date()
    const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    const { desde, hasta, enCurso } = rangoDelMes(mes, hoy)
    const { data, isLoading, isError, refetch, isFetching } = useMisMetricas(desde, hasta)

    const minimo = new Date(hoy.getFullYear(), hoy.getMonth() - MESES_HACIA_ATRAS, 1)
    const puedeRetroceder = mes > minimo
    const mover = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))

    return (
        <div
            className="flex h-full flex-col overflow-hidden bg-[#EEF1F6]"
            style={probando ? { paddingTop: ALTO_BANNER_PRUEBA } : undefined}
        >
            <BannerPrueba />
            {/* Mismas dos líneas finas que el AppHeader de Plani (marca · avatar, y debajo
                ‹ período ›): cambiar de pestaña no puede cambiar el alto del header. */}
            <header className="bg-dsnavy px-3.5 pb-1.5 pt-2.5 text-white">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                            <span className="text-[13px] font-black leading-none tracking-tight text-dsnavy">
                                D<span className="text-dsgreen">S</span>
                            </span>
                        </div>
                        <span className="truncate text-[14px] font-extrabold tracking-tight">Mis métricas</span>
                    </div>
                    <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        aria-label="Mes anterior"
                        disabled={!puedeRetroceder}
                        onClick={() => mover(-1)}
                        className="grid h-8 w-10 shrink-0 place-items-center rounded-md text-white/70 active:bg-white/10 disabled:opacity-30"
                    >
                        <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                    </button>
                    <div className="flex min-w-0 items-center justify-center gap-1.5">
                        <span className="truncate text-[13.5px] font-extrabold" data-testid="mes-metricas">
                            {nombreMes(mes)}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-white/60">
                            · {enCurso ? `al ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}` : 'completo'}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label="Mes siguiente"
                        disabled={enCurso}
                        onClick={() => mover(1)}
                        className="grid h-8 w-10 shrink-0 place-items-center rounded-md text-white/70 active:bg-white/10 disabled:opacity-30"
                    >
                        <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
                    </button>
                </div>
            </header>

            <main
                className={`no-scrollbar flex-1 overflow-y-auto px-3 py-2 transition-opacity ${isFetching && data ? 'opacity-60' : ''}`}
            >
                {isLoading && (
                    <p className="py-10 text-center text-[13px] font-semibold text-dsmuted">Cargando tus métricas…</p>
                )}
                {isError && !data && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <p className="text-[13px] font-semibold text-dsnavytext">No pudimos cargar tus métricas.</p>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="rounded-xl bg-dsnavy px-4 py-2 text-[13px] font-bold text-white"
                        >
                            Volver a intentar
                        </button>
                    </div>
                )}
                {data && <Contenido m={data} />}
            </main>
        </div>
    )
}

function Contenido({ m }: { m: IMisMetricas }) {
    // El vendedor de prueba no existe en el warehouse (invariante de PRUEBA-*): no tiene
    // cartera, así que ninguna métrica se puede calcular — no es un vendedor sin clientes.
    if (m.sinVentas && m.cartera === 0) {
        return (
            <p className="py-10 text-center text-[13px] font-semibold text-dsmuted">
                Tu vendedor de prueba no tiene métricas: se calculan con datos reales de ventas y cartera.
            </p>
        )
    }
    if (m.cartera === 0) {
        return <p className="py-10 text-center text-[13px] font-semibold text-dsmuted">Todavía no tenés clientes asignados.</p>
    }
    // Todo entra en UNA pantalla de teléfono sin scroll (375×812 con banner de prueba y tab
    // bar), y en pantallas más altas se ESTIRA para ocuparla (`min-h-full` + flex): las
    // secciones reparten el alto 3:2 y los tiles crecen, en vez de dejar un hueco abajo.
    // En una pantalla más chica que el contenido, vuelve a su alto natural y scrollea.
    return (
        <div className="flex min-h-full flex-col gap-2.5">
            <Seccion titulo="Productividad" className="flex-[3]">
                <div className="grid flex-[2] auto-rows-fr grid-cols-2 gap-2">
                    <Tile
                        testId="tile-visitados"
                        titulo="Clientes visitados"
                        valor={formatEntero(m.clientesVisitados)}
                        de={formatEntero(m.cartera)}
                        pct={razon(m.clientesVisitados, m.cartera)}
                    />
                    <Tile
                        testId="tile-con-compra"
                        titulo="Clientes con compra"
                        valor={formatEntero(m.clientesConCompra)}
                        de={formatEntero(m.cartera)}
                        pct={razon(m.clientesConCompra, m.cartera)}
                    />
                    <Tile
                        testId="tile-tasa-cierre"
                        titulo="Tasa de cierre"
                        valor={formatPct(razon(m.visitadosConCompra, m.clientesVisitados))}
                        pie={`${formatEntero(m.visitadosConCompra)} de ${formatEntero(m.clientesVisitados)} compraron`}
                    />
                    <Tile
                        testId="tile-ventas-planificacion"
                        titulo="Ventas vs planificación"
                        valor={formatEntero(m.planificadosConCompra)}
                        de={formatEntero(m.planificados)}
                        pct={razon(m.planificadosConCompra, m.planificados)}
                    />
                </div>

                <p className="mb-2 mt-3 text-[10.5px] font-extrabold uppercase tracking-wide text-dsmuted">
                    Vs objetivo del mes
                </p>
                <div className="grid flex-1 grid-cols-3 gap-2">
                    <TileObjetivo
                        testId="objetivo-visitas"
                        titulo="Visitas válidas"
                        real={m.visitasValidas}
                        objetivo={m.objetivoVisitas}
                        formato={formatEntero}
                    />
                    <TileObjetivo
                        testId="objetivo-clientes"
                        titulo="Clientes"
                        real={m.clientesDistintos}
                        objetivo={m.objetivoClientes}
                        formato={formatEntero}
                    />
                    <TileObjetivo
                        testId="objetivo-horas"
                        titulo="Horas"
                        real={m.minutosTotales}
                        objetivo={m.objetivoMinutos}
                        formato={formatHoras}
                        unidad="h"
                    />
                </div>
            </Seccion>

            <Seccion titulo="Ventas" subtitulo="vs mismo período del año pasado" className="flex-[2]">
                {m.sinVentas ? (
                    <p className="py-3 text-center text-[13px] font-semibold text-dsmuted">
                        Sin datos de ventas para este vendedor.
                    </p>
                ) : (
                    <div className="grid flex-1 grid-cols-3 gap-2">
                        <Anillo
                            testId="anillo-facturacion"
                            titulo="Facturación"
                            valor={formatMillones(m.facturacion)}
                            unidad="$M"
                            actual={m.facturacion}
                            anterior={m.facturacionMmaa}
                        />
                        <Anillo
                            testId="anillo-unidades"
                            titulo="Unidades"
                            valor={formatEntero(m.unidades)}
                            unidad="u."
                            actual={m.unidades}
                            anterior={m.unidadesMmaa}
                        />
                        <Anillo
                            testId="anillo-super-rubro"
                            titulo="Super rubro"
                            valor={formatEntero(m.superRubro)}
                            unidad="SR"
                            actual={m.superRubro}
                            anterior={m.superRubroMmaa}
                        />
                    </div>
                )}
            </Seccion>
        </div>
    )
}

function Seccion({
    titulo,
    subtitulo,
    className = '',
    children,
}: {
    titulo: string
    subtitulo?: string
    className?: string
    children: React.ReactNode
}) {
    return (
        <section className={`flex flex-col rounded-2xl border border-dsline bg-white p-3 shadow-sm ${className}`}>
            <h2 className="text-[11.5px] font-extrabold uppercase tracking-wide text-dsnavy">
                {titulo}
                {subtitulo && <span className="font-semibold normal-case tracking-normal text-dsmuted"> · {subtitulo}</span>}
            </h2>
            <div className="mt-2.5 flex flex-1 flex-col">{children}</div>
        </section>
    )
}

const TILE = 'flex flex-col rounded-xl bg-[#F4F6FA] px-3 py-2.5'
/** El título puede ir en dos líneas ("Ventas vs planificación") y los números se pegan
 *  abajo (`mt-auto`): así los tiles de una misma fila quedan con los valores alineados
 *  aunque un título ocupe una línea y el de al lado dos. Truncarlo se leía "…PLANIFICACI…". */
const TITULO_TILE = 'text-[10px] font-extrabold uppercase leading-tight tracking-wide text-dsnavytext'

interface TileProps {
    testId: string
    titulo: string
    valor: string
    /** Denominador: "119 / 145". Sin él, el valor va solo (la tasa ya es un %). */
    de?: string
    pct?: number | null
    pie?: string
}

/** Título arriba; número y % en la MISMA línea, el % contra el borde derecho. Así los cuatro
 *  tiles quedan alineados en dos columnas y miden lo mismo, con o sin badge. */
function Tile({ testId, titulo, valor, de, pct, pie }: TileProps) {
    return (
        <div data-testid={testId} className={TILE}>
            <p className={TITULO_TILE}>{titulo}</p>
            <div className="mt-auto flex items-center justify-between gap-1.5 pt-1.5">
                <p className="whitespace-nowrap text-[23px] font-black leading-none tabular-nums text-dsnavytext">
                    {valor}
                    {de && <span className="text-[14px] font-bold text-dsmuted"> / {de}</span>}
                </p>
                {pct !== undefined && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums ${BADGE[tonoCumplimiento(pct)]}`}>
                        {formatPct(pct)}
                    </span>
                )}
                {pie && <p className="text-right text-[10px] font-semibold leading-tight text-dsmuted">{pie}</p>}
            </div>
        </div>
    )
}

interface TileObjetivoProps {
    testId: string
    titulo: string
    real: number
    objetivo: number | null
    formato: (n: number) => string
    unidad?: string
}

/** Real contra el objetivo de `pl_objetivo`, con lo que falta para llegar: es lo único
 *  accionable para el vendedor ("me faltan 18 visitas"), más que el % solo. */
function TileObjetivo({ testId, titulo, real, objetivo, formato, unidad }: TileObjetivoProps) {
    const pct = razon(real, objetivo)
    const sufijo = unidad ? ` ${unidad}` : ''
    const falta = objetivo !== null ? objetivo - real : null
    return (
        <div data-testid={testId} className={TILE}>
            <p className={TITULO_TILE}>{titulo}</p>
            <p className="mt-auto whitespace-nowrap pt-1.5 text-[18px] font-black leading-none tabular-nums text-dsnavytext">
                {formato(real)}
                {objetivo !== null && (
                    <span className="text-[13px] font-bold text-dsmuted"> / {formato(objetivo)}</span>
                )}
                <span className="text-[10.5px] font-bold text-dsmuted">{sufijo}</span>
            </p>
            {objetivo === null ? (
                <p className="mt-1.5 text-[10px] font-bold text-dsmuted">sin objetivo</p>
            ) : (
                <>
                    <span
                        className={`mt-1.5 self-start rounded-full px-2 py-px text-[10.5px] font-extrabold tabular-nums ${BADGE[tonoCumplimiento(pct)]}`}
                    >
                        {formatPct(pct)}
                    </span>
                    <span className="mt-1 whitespace-nowrap text-[10px] font-semibold text-dsmuted">
                        {falta !== null && falta > 0 ? `faltan ${formato(falta)}${sufijo}` : 'cumplido'}
                    </span>
                </>
            )}
        </div>
    )
}

const RADIO = 30
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

interface AnilloProps {
    testId: string
    titulo: string
    valor: string
    unidad: string
    actual: number
    anterior: number
}

/** El anillo mide contra el MMAA, no contra una meta: no hay metas de venta cargadas y
 *  mostrar "88% de tu meta" sobre una meta inventada es peor que no mostrarla. 90% =
 *  llevás el 90% de lo que vendiste en este mismo período el año pasado. Se llena hasta
 *  el 100%; el número de adentro sigue mostrando el real. */
function Anillo({ testId, titulo, valor, unidad, actual, anterior }: AnilloProps) {
    const pct = razon(actual, anterior)
    const v = variacion(actual, anterior)
    const lleno = Math.min(Math.max(pct ?? 0, 0), 1)
    return (
        <div data-testid={testId} className="flex flex-col items-center justify-center rounded-xl bg-[#F4F6FA] px-1 py-2.5 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-dsnavytext">{titulo}</p>
            <div className="relative mt-1.5 h-[72px] w-[72px]">
                <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="36" cy="36" r={RADIO} fill="none" strokeWidth="8" stroke="#E7E9F0" />
                    <circle
                        cx="36" cy="36" r={RADIO} fill="none" strokeWidth="8" strokeLinecap="round"
                        className={pct !== null && pct < 1 ? 'stroke-[#F59E0B]' : 'stroke-dsgreen'}
                        strokeDasharray={CIRCUNFERENCIA}
                        strokeDashoffset={CIRCUNFERENCIA * (1 - lleno)}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[15px] font-black tabular-nums text-dsnavytext">
                    {formatPct(pct)}
                </span>
            </div>
            <p className="mt-1.5 text-[14px] font-black leading-tight tabular-nums text-dsnavytext">
                {valor} <span className="text-[10px] font-bold text-dsmuted">{unidad}</span>
            </p>
            <p className={`text-[10px] font-extrabold leading-tight tabular-nums ${claseVariacion(v)}`}>
                {v === null ? 'sin dato año pasado' : `${formatVariacion(v)} vs MMAA`}
            </p>
        </div>
    )
}
