import { useState } from 'react'
import KpisMensuales from './KpisMensuales'
import SelectorMes from './SelectorMes'
import TablaEfectividadOperativa from './TablaEfectividadOperativa'
import { useResumen } from '@/hooks/useAnalitica'
import { rangoMes } from '@/lib/fechas'

/** Bloque de KPIs de actividad mensual (Efectividad operativa, Visitas, Horas).
 *  Tiene su propio selector de mes, independiente del filtro desde/hasta del resto
 *  de /analitica — ver docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. */
export default function EfectividadOperativaSection() {
    const [mes, setMes] = useState(() => new Date())
    const filtro = rangoMes(mes)
    const { data, isLoading, isError } = useResumen(filtro)

    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Efectividad operativa</h2>
                <SelectorMes mes={mes} onCambiarMes={setMes} />
            </div>

            {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

            {isError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    No se pudo cargar la efectividad operativa. Probá de nuevo en un momento.
                </p>
            )}

            {data && data.vendedores.length === 0 && (
                <p className="text-sm text-slate-500">Sin datos para este mes.</p>
            )}

            {data && data.vendedores.length > 0 && (
                <>
                    <KpisMensuales promedios={data.promedios} />
                    <TablaEfectividadOperativa vendedores={data.vendedores} promedios={data.promedios} />
                </>
            )}
        </section>
    )
}
