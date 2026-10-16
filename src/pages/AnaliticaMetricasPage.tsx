import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltroPeriodo from '@/components/analitica/FiltroPeriodo'
import FacturacionVendedores from '@/components/analitica/metricas/FacturacionVendedores'
import ProductividadEquipo from '@/components/analitica/metricas/ProductividadEquipo'
import RankingObjeciones from '@/components/analitica/metricas/RankingObjeciones'
import Pestanas from '@/components/ui/Pestanas'
import Segmentado from '@/components/ui/Segmentado'
import { rangoDePeriodo, type ModoPeriodo } from '@/lib/periodo'
import { OPCIONES_FILTRO_TIPO, type FiltroTipo } from '@/lib/tipoPersona'

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
 *
 * Es la pantalla de referencia del estándar UI (skill `ui-planificacion`): una sola fila con las
 * subsecciones a la izquierda y los filtros a la derecha, todo a 32 px, y el contenido con el
 * mismo borde izquierdo que el encabezado.
 */
export default function AnaliticaMetricasPage() {
    const [params, setParams] = useSearchParams()
    const vista: VistaMetricas = esVista(params.get('vista')) ? (params.get('vista') as VistaMetricas) : 'productividad'
    const filtroTipo: FiltroTipo = esTipo(params.get('tipo')) ? (params.get('tipo') as FiltroTipo) : 'vendedor'
    const [modo, setModo] = useState<ModoPeriodo>('mes')
    const [fecha, setFecha] = useState(() => new Date())
    const { desde, hasta } = rangoDePeriodo(modo, fecha)

    const escribir = (clave: 'vista' | 'tipo', valor: string, porDefecto: string) => {
        const siguiente = new URLSearchParams(params)
        if (valor === porDefecto) siguiente.delete(clave)
        else siguiente.set(clave, valor)
        setParams(siguiente, { replace: true })
    }

    return (
        <div className="min-h-screen bg-superficie">
            <EncabezadoAnalitica
                filtros={
                    <>
                        <Pestanas
                            etiqueta="Métricas"
                            opciones={VISTAS}
                            valor={vista}
                            onCambiar={v => escribir('vista', v, 'productividad')}
                        />
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <Segmentado
                                etiqueta="Tipo de persona"
                                opciones={OPCIONES_FILTRO_TIPO.map(o => ({ valor: o.valor, etiqueta: o.etiqueta }))}
                                valor={filtroTipo}
                                onCambiar={t => escribir('tipo', t, 'vendedor')}
                            />
                            {vista !== 'facturacion' && (
                                <>
                                    <span className="mx-1 h-5 w-px bg-linea" aria-hidden />
                                    <FiltroPeriodo modo={modo} fecha={fecha} onCambiarModo={setModo} onCambiarFecha={setFecha} />
                                </>
                            )}
                        </div>
                    </>
                }
            />

            <main className="px-6 py-5">
                {vista === 'productividad' && <ProductividadEquipo desde={desde} hasta={hasta} filtroTipo={filtroTipo} />}
                {vista === 'objeciones' && <RankingObjeciones desde={desde} hasta={hasta} filtroTipo={filtroTipo} />}
                {vista === 'facturacion' && <FacturacionVendedores filtroTipo={filtroTipo} />}
            </main>
        </div>
    )
}
