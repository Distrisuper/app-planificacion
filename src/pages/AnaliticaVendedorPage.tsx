import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import TablaVisitas from '@/components/analitica/TablaVisitas'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import AccountMenu from '@/components/AccountMenu'
import { useAuth } from '@/context/AuthContext'
import { useResumen, useVisitas } from '@/hooks/useAnalitica'
import { formatDuracion, formatNumero, formatPct } from '@/lib/analiticaFormat'

export default function AnaliticaVendedorPage() {
    const { user, logout } = useAuth()
    const { codigo = '' } = useParams()
    const [params] = useSearchParams()
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)

    const { data: resumen } = useResumen({ desde, hasta })
    const { data: pagina, isLoading } = useVisitas({ desde, hasta, vendedor: codigo })

    const vendedor = resumen?.vendedores.find(v => v.codigoParticularVendedor === codigo)
    const promedios = resumen?.promedios

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
                <div>
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
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor && promedios && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        {[
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
                            {
                                titulo: 'No validadas',
                                valor: formatNumero(vendedor.visitasNoValidadas),
                                prom: formatNumero(promedios.visitasNoValidadas),
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

                {pagina && pagina.visitas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin visitas en este rango.
                    </div>
                )}

                {pagina && pagina.visitas.length > 0 && (
                    <TablaVisitas visitas={pagina.visitas} onElegirVisita={setVisitaElegida} />
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
