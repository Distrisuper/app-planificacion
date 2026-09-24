import { useState } from 'react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import SelectorPeriodo, { type ModoPeriodo } from '@/components/analitica/SelectorPeriodo'
import BloqueCategorias from '@/components/metricas/BloqueCategorias'
import BloqueObjeciones from '@/components/metricas/BloqueObjeciones'
import BloqueVentas from '@/components/metricas/BloqueVentas'
import FiltrosMetricas, { type IValorFiltros } from '@/components/metricas/FiltrosMetricas'
import { useOpcionesMetricas, useResumenMetricas } from '@/hooks/useMetricas'
import { incluyeHoy, isoLocal, rangoMes, rangoSemana } from '@/lib/fechas'
import type { IFiltroMetricas } from '@/types/metricas'

/** "Métricas": ventas + visitas + objeciones + cartera, sobre el mismo recorte de clientes.
 *  Spec docs/superpowers/specs/2026-09-24-pestana-metricas-gerencia-design.md. */
export default function AnaliticaMetricasPage() {
    const [modo, setModo] = useState<ModoPeriodo>('mes')
    const [fecha, setFecha] = useState(() => new Date())
    const [rango, setRango] = useState(() => ({ desde: rangoMes(new Date()).desde, hasta: isoLocal(new Date()) }))
    const [geo, setGeo] = useState<IValorFiltros>({})
    const [proyectado, setProyectado] = useState(false)

    const periodo = modo === 'mes' ? rangoMes(fecha) : modo === 'semana' ? rangoSemana(fecha) : rango
    const filtro: IFiltroMetricas = { ...periodo, ...geo }
    const puedeProyectar = modo === 'mes' && incluyeHoy(periodo.desde, periodo.hasta)

    const { data: opciones } = useOpcionesMetricas(periodo.hasta)
    // El resumen va SIN vendedor: el backend lo ignora igual (el ranking es de todo el recorte
    // y la fila elegida la resuelve el front), así que incluirlo solo duplicaría la caché y
    // volvería a pedir lo mismo al elegir un vendedor. Además es el roster del filtro de
    // vendedor: los vendedores con cartera dentro del recorte geográfico.
    const filtroSinVendedor: IFiltroMetricas = {
        ...periodo, sucursal: geo.sucursal, zona: geo.zona, localidad: geo.localidad,
    }
    const resumen = useResumenMetricas(filtroSinVendedor)
    const vendedores = (resumen.data?.vendedores ?? []).map(v => ({ codigo: v.codigoVendedor, nombre: v.nombreVendedor }))

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica>
                <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-3">
                    <FiltrosMetricas valor={geo} onCambiar={setGeo} vendedores={vendedores} opciones={opciones} />
                    <div className="flex items-center gap-3">
                        <SelectorPeriodo
                            modo={modo} fecha={fecha} conRango rango={rango}
                            onCambiarModo={m => { setModo(m); setProyectado(false) }}
                            onCambiarFecha={setFecha} onCambiarRango={setRango}
                        />
                        {puedeProyectar && (
                            <button
                                type="button"
                                aria-pressed={proyectado}
                                onClick={() => setProyectado(p => !p)}
                                className={`rounded-md border px-2 py-1 text-xs ${
                                    proyectado ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                Ver proyectado
                            </button>
                        )}
                    </div>
                </div>
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <BloqueVentas query={resumen} vendedor={geo.vendedor} proyectado={proyectado && puedeProyectar} />
                <BloqueObjeciones filtro={filtro} />
                <BloqueCategorias filtro={filtro} />
            </main>
        </div>
    )
}
