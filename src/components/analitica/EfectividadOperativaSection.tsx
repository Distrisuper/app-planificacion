import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KpisMensuales from './KpisMensuales'
import ObjecionesMercado from './ObjecionesMercado'
import SelectorPeriodo, { type ModoPeriodo } from './SelectorPeriodo'
import TablaEfectividadOperativa from './TablaEfectividadOperativa'
import { useResumen } from '@/hooks/useAnalitica'
import { rangoMes, rangoSemana } from '@/lib/fechas'

/** Único bloque de /analitica: KPIs + tabla + objeciones, todos sobre el mismo rango
 *  elegido acá (semana o mes) — ver
 *  docs/superpowers/specs/2026-08-19-unificar-efectividad-operativa-design.md. */
export default function EfectividadOperativaSection() {
    const navigate = useNavigate()
    const [modo, setModo] = useState<ModoPeriodo>('mes')
    const [fecha, setFecha] = useState(() => new Date())
    const filtro = modo === 'mes' ? rangoMes(fecha) : rangoSemana(fecha)
    const { data, isLoading, isError } = useResumen(filtro)

    const irAVendedor = (codigo: string) => {
        const params = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta })
        navigate(`/analitica/vendedor/${codigo}?${params}`)
    }

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Efectividad operativa</h2>
                <SelectorPeriodo modo={modo} fecha={fecha} onCambiarModo={setModo} onCambiarFecha={setFecha} />
            </div>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

            {isError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudo cargar la efectividad operativa. Probá de nuevo en un momento.
                </p>
            )}

            {data && data.vendedores.length === 0 && (
                <p className="text-sm text-slate-500">
                    Sin datos para {modo === 'mes' ? 'este mes' : 'esta semana'}.
                </p>
            )}

            {data && data.vendedores.length > 0 && (
                <>
                    <KpisMensuales promedios={data.promedios} />
                    <TablaEfectividadOperativa
                        vendedores={data.vendedores}
                        promedios={data.promedios}
                        onElegirVendedor={irAVendedor}
                    />
                    <ObjecionesMercado desde={filtro.desde} hasta={filtro.hasta} />
                </>
            )}
        </section>
    )
}
