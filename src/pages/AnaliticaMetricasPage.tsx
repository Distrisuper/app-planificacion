import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import SelectorPeriodo, { type ModoPeriodo } from '@/components/analitica/SelectorPeriodo'
import FacturacionVendedores from '@/components/analitica/metricas/FacturacionVendedores'
import ProductividadEquipo from '@/components/analitica/metricas/ProductividadEquipo'
import RankingObjeciones from '@/components/analitica/metricas/RankingObjeciones'
import { Segmentado } from '@/components/analitica/metricas/ui'
import { rangoDia, rangoMes, rangoSemana } from '@/lib/fechas'
import { OPCIONES_FILTRO_TIPO, type FiltroTipo } from '@/lib/tipoPersona'
import { cn } from '@/lib/utils'

export type VistaMetricas = 'productividad' | 'objeciones' | 'facturacion'

const VISTAS: { valor: VistaMetricas; etiqueta: string }[] = [
    { valor: 'productividad', etiqueta: 'Productividad' },
    { valor: 'objeciones', etiqueta: 'Ranking de objeciones' },
    { valor: 'facturacion', etiqueta: 'Facturación' },
]

const esVista = (v: string | null): v is VistaMetricas => VISTAS.some(x => x.valor === v)
const esTipo = (v: string | null): v is FiltroTipo => OPCIONES_FILTRO_TIPO.some(x => x.valor === v)

/**
 * Métricas del equipo para gerencia: Productividad, Ranking de objeciones y Facturación, de
 * un tipo de persona por vez (Vendedor por defecto, Farmer o Hunter: no se mezclan). La vista y el
 * tipo viven en la URL (atrás/recargar/compartir los conservan); el período es de la pantalla,
 * como en Efectividad. Facturación no usa el período: trae sus columnas fijas (mes, M.ANT,
 * P.3M, P.6M, P.12M), como Versus.
 */
export default function AnaliticaMetricasPage() {
    const [params, setParams] = useSearchParams()
    const vista: VistaMetricas = esVista(params.get('vista')) ? (params.get('vista') as VistaMetricas) : 'productividad'
    const filtroTipo: FiltroTipo = esTipo(params.get('tipo')) ? (params.get('tipo') as FiltroTipo) : 'vendedor'
    const [modo, setModo] = useState<ModoPeriodo>('mes')
    const [fecha, setFecha] = useState(() => new Date())
    const { desde, hasta } = modo === 'mes' ? rangoMes(fecha) : modo === 'dia' ? rangoDia(fecha) : rangoSemana(fecha)

    const escribir = (clave: 'vista' | 'tipo', valor: string, porDefecto: string) => {
        const siguiente = new URLSearchParams(params)
        if (valor === porDefecto) siguiente.delete(clave)
        else siguiente.set(clave, valor)
        setParams(siguiente, { replace: true })
    }

    return (
        <div className="min-h-screen bg-[#EEF1F6]">
            <EncabezadoAnalitica>
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-6 py-3">
                    <nav aria-label="Métricas" className="flex gap-1 rounded-xl bg-slate-100 p-1">
                        {VISTAS.map(v => (
                            <button
                                key={v.valor}
                                type="button"
                                aria-current={vista === v.valor ? 'page' : undefined}
                                onClick={() => escribir('vista', v.valor, 'productividad')}
                                className={cn(
                                    'h-9 rounded-lg px-4 text-sm font-semibold transition-colors',
                                    vista === v.valor ? 'bg-white text-dsnavytext shadow-sm' : 'text-slate-500 hover:text-slate-800',
                                )}
                            >
                                {v.etiqueta}
                            </button>
                        ))}
                    </nav>
                    <span className="flex-1" />
                    <Segmentado
                        etiqueta="Tipo de persona"
                        opciones={OPCIONES_FILTRO_TIPO.map(o => ({ valor: o.valor, etiqueta: o.etiqueta }))}
                        valor={filtroTipo}
                        onCambiar={t => escribir('tipo', t, 'vendedor')}
                    />
                    {vista !== 'facturacion' && (
                        <SelectorPeriodo modo={modo} fecha={fecha} onCambiarModo={setModo} onCambiarFecha={setFecha} />
                    )}
                </div>
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl px-6 py-6">
                {vista === 'productividad' && <ProductividadEquipo desde={desde} hasta={hasta} filtroTipo={filtroTipo} />}
                {vista === 'objeciones' && <RankingObjeciones desde={desde} hasta={hasta} filtroTipo={filtroTipo} />}
                {vista === 'facturacion' && <FacturacionVendedores filtroTipo={filtroTipo} />}
            </main>
        </div>
    )
}
