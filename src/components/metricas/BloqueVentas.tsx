import type { UseQueryResult } from '@tanstack/react-query'
import Cargando from './Cargando'
import KpiTile from '@/components/analitica/KpiTile'
import { formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import {
    OBJETIVO_TASA_CIERRE, claseAnillo, claseCumplimiento, cumplimiento, factorProyeccion,
    formatMillones, objetivosVenta, proyectar, razon, variacion,
} from '@/lib/metricas'
import type { IMetricasResumen } from '@/types/metricas'

interface BloqueVentasProps {
    query: UseQueryResult<IMetricasResumen>
    vendedor?: string
    proyectado: boolean
}

interface TileMetaProps {
    testId: string
    titulo: string
    real: string
    objetivo: string
    unidad: string
    pct: number | null
    varAA: number | null
}

const signo = (v: number) => (v >= 0 ? '+' : '')

const RADIO = 54
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

/** Anillo de cumplimiento (como el mockup). Se llena hasta el 100% y el número de adentro
 *  sigue mostrando el real: 190% es un anillo completo que dice 190%. */
function Anillo({ pct }: { pct: number | null }) {
    const lleno = Math.min(Math.max(pct ?? 0, 0), 1)
    return (
        <div className="relative mx-auto mt-3 h-[120px] w-[120px]">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="60" cy="60" r={RADIO} fill="none" strokeWidth="12" className="stroke-slate-100" />
                <circle
                    cx="60" cy="60" r={RADIO} fill="none" strokeWidth="12"
                    className={claseAnillo(pct)}
                    strokeDasharray={CIRCUNFERENCIA}
                    strokeDashoffset={CIRCUNFERENCIA * (1 - lleno)}
                />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-2xl font-semibold ${claseCumplimiento(pct)}`}>
                {formatPct(pct)}
            </span>
        </div>
    )
}

function TileMeta({ testId, titulo, real, objetivo, unidad, pct, varAA }: TileMetaProps) {
    return (
        <div data-testid={testId} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <Anillo pct={pct} />
            <p className="mt-3 text-lg font-semibold text-slate-900">
                {real} <span className="text-sm font-normal text-slate-400">/ {objetivo} {unidad}</span>
            </p>
            <p className={`mt-1 text-xs ${varAA === null ? 'text-slate-400' : varAA >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {varAA === null ? 's/d' : `${signo(varAA)}${Math.round(varAA * 100)}%`} vs año anterior
            </p>
        </div>
    )
}

export default function BloqueVentas({ query, vendedor, proyectado }: BloqueVentasProps) {
    const { data, isLoading, isError, refetch } = query

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Métricas de ventas</h2>

            {isLoading && <Cargando />}

            {isError && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudieron cargar las métricas.
                    <button type="button" onClick={() => refetch()} className="font-medium underline">
                        Volver a intentar
                    </button>
                </div>
            )}

            {data && (() => {
                const base = vendedor
                    ? data.vendedores.find(v => v.codigoVendedor === vendedor)
                    : data.equipo
                if (!base || base.cartera === 0) {
                    return <p className="text-sm text-slate-500">Sin clientes para estos filtros.</p>
                }
                const factor = factorProyeccion(data.diasHabiles, data.diasHabilesTranscurridos)
                const f = proyectado ? proyectar(base, factor) : base
                const obj = objetivosVenta(vendedor ? 1 : data.vendedores.length, data.diasHabiles, data.mesCompleto)
                const tasaCierre = razon(f.visitadosConCompra, f.clientesVisitados)

                return (
                    <>
                        {proyectado && (
                            <p className="text-xs text-amber-600">
                                Proyectado a fin de mes con el ritmo de {data.diasHabilesTranscurridos} de {data.diasHabiles} días hábiles.
                            </p>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <TileMeta
                                testId="tile-facturacion" titulo="Facturación" unidad="$M"
                                real={formatMillones(f.facturacion)} objetivo={formatMillones(obj.facturacion)}
                                pct={cumplimiento(f.facturacion, obj.facturacion)}
                                varAA={variacion(f.facturacion, f.facturacionMmaa)}
                            />
                            <TileMeta
                                testId="tile-unidades" titulo="Unidades" unidad="u."
                                real={formatNumero(f.unidades)} objetivo={formatNumero(obj.unidades)}
                                pct={cumplimiento(f.unidades, obj.unidades)}
                                varAA={variacion(f.unidades, f.unidadesMmaa)}
                            />
                            <TileMeta
                                testId="tile-super-rubro" titulo="Super Rubro" unidad="SR"
                                real={formatNumero(f.superRubro)} objetivo={formatNumero(obj.superRubro)}
                                pct={cumplimiento(f.superRubro, obj.superRubro)}
                                varAA={variacion(f.superRubro, f.superRubroMmaa)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                            <KpiTile
                                titulo="Cantidad de visitas" valor={formatNumero(f.visitasValidas)}
                                meta={`Objetivo: ${formatNumero(f.objetivoVisitas)} · ${formatPct(cumplimiento(f.visitasValidas, f.objetivoVisitas))}`}
                            />
                            <KpiTile
                                titulo="Clientes visitados" valor={formatNumero(f.clientesVisitados)}
                                meta={`Objetivo: ${formatNumero(f.objetivoClientes)} · ${formatPct(cumplimiento(f.clientesVisitados, f.objetivoClientes))}`}
                            />
                            <KpiTile
                                titulo="Tasa de cierre" valor={formatPct(tasaCierre)}
                                meta={`Objetivo: ${formatPct(OBJETIVO_TASA_CIERRE)}`}
                                ayuda="Clientes visitados que además compraron en el período, sobre clientes visitados."
                            />
                            <KpiTile
                                titulo="Horas totales" valor={formatHoras(f.minutosTotales)}
                                meta={`Objetivo: ${formatHoras(f.objetivoMinutos)} · ${formatPct(cumplimiento(f.minutosTotales, f.objetivoMinutos))}`}
                            />
                            <div data-testid="tile-rentabilidad">
                                <KpiTile
                                    titulo="Rentabilidad de cartera" valor={formatPct(f.rentabilidad)}
                                    ayuda={!data.mesCompleto ? 'La rentabilidad se calcula sobre meses completos.' : undefined}
                                />
                            </div>
                        </div>
                    </>
                )
            })()}
        </section>
    )
}
