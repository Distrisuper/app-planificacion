import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import TablaVisitas from '@/components/analitica/TablaVisitas'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import { useResumen, useVisitasPaginadas } from '@/hooks/useAnalitica'
import { formatDuracion, formatNumero, formatPct } from '@/lib/analiticaFormat'

export default function AnaliticaVendedorPage() {
    const { codigo = '' } = useParams()
    const [params, setParams] = useSearchParams()
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    // El rango vive en la URL: así "Volver a la analítica" lo arrastra y el link se
    // puede compartir. `replace` para no llenar el historial con cada fecha tocada.
    const setRango = (d: string, h: string) =>
        setParams({ desde: d, hasta: h }, { replace: true })
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)

    const { data: resumen } = useResumen({ desde, hasta })
    const {
        data,
        isLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useVisitasPaginadas({ desde, hasta, vendedor: codigo, cant: 100 })
    const visitas = data?.pages.flatMap(p => p.visitas) ?? []
    const total = data?.pages[0]?.total ?? 0

    const vendedor = resumen?.vendedores.find(v => v.codigoParticularVendedor === codigo)
    const promedios = resumen?.promedios

    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica
                izquierda={
                    <>
                        <Link
                            to={`/analitica?desde=${desde}&hasta=${hasta}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Volver a la analítica
                        </Link>
                        <h1 className="mt-1 text-lg font-semibold text-slate-900">
                            {vendedor?.nombreVendedor ?? codigo}
                        </h1>
                        <p className="text-xs text-slate-500">
                            {desde} a {hasta}
                        </p>
                    </>
                }
            >
                <FiltrosAnalitica filtro={{ desde, hasta }} onRango={setRango} />
            </EncabezadoAnalitica>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor && promedios && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                        {[
                            // Los tres conteos van primero y juntos: total = válidas + no
                            // validadas + sin coordenadas (esas últimas no son culpa del
                            // vendedor y las explica el aviso de abajo). Son visitas, no
                            // filas de la tabla: la tabla también lista los "no visité".
                            {
                                titulo: 'Visitas',
                                valor: formatNumero(vendedor.visitasTotales),
                                prom: formatNumero(promedios.visitasTotales),
                            },
                            {
                                titulo: 'Válidas',
                                valor: formatNumero(vendedor.visitasValidas),
                                prom: formatNumero(promedios.visitasValidas),
                            },
                            {
                                titulo: 'No validadas',
                                valor: formatNumero(vendedor.visitasNoValidadas),
                                prom: formatNumero(promedios.visitasNoValidadas),
                            },
                            {
                                titulo: 'Cobertura',
                                valor: formatPct(vendedor.cobertura),
                                prom: formatPct(promedios.cobertura),
                            },
                            {
                                titulo: 'Efect. comercial',
                                valor: formatPct(vendedor.efectividadComercial),
                                prom: formatPct(promedios.efectividadComercial),
                            },
                            {
                                titulo: 'Visitas/día',
                                valor: formatNumero(vendedor.visitasPorDia),
                                prom: formatNumero(promedios.visitasPorDia),
                            },
                            {
                                titulo: 'Duración prom.',
                                valor: formatDuracion(vendedor.duracionPromedioMin),
                                prom: formatDuracion(promedios.duracionPromedioMin),
                            },
                        ].map(k => (
                            <div
                                key={k.titulo}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                            >
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    {k.titulo}
                                </p>
                                <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                                <p className="text-xs text-slate-400">equipo: {k.prom}</p>
                            </div>
                        ))}
                    </div>
                )}

                {vendedor && vendedor.visitasSinCoord > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        {vendedor.visitasSinCoord} visitas no verificables: el cliente no tiene
                        coordenadas cargadas.
                    </p>
                )}

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {data && visitas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin visitas en este rango.
                    </div>
                )}

                {data && visitas.length > 0 && (
                    <div className="space-y-3">
                        <TablaVisitas visitas={visitas} onElegirVisita={setVisitaElegida} />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                                Mostrando {visitas.length} de {total}
                            </span>
                            {hasNextPage && (
                                <button
                                    type="button"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    {isFetchingNextPage ? 'Cargando…' : 'Mostrar más'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {visitaElegida !== null && (
                    <DetalleVisitaPanel
                        visitaId={visitaElegida}
                        onCerrar={() => setVisitaElegida(null)}
                    />
                )}
            </main>
        </div>
    )
}
