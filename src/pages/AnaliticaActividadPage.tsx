import { useState } from 'react'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import TablaActividad from '@/components/analitica/TablaActividad'
import DetalleVisitaPanel from '@/components/analitica/DetalleVisitaPanel'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import { useAuth } from '@/context/AuthContext'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useResumen, useVendedores, useVisitas } from '@/hooks/useAnalitica'
import { incluyeHoy, rangoHoy } from '@/lib/fechas'
import { formatNumero, formatPct } from '@/lib/analiticaFormat'

/** Cada cuánto se refresca cuando el rango llega hasta hoy. Un minuto alcanza para
 *  seguir la jornada sin machacar la API: una visita dura decenas de minutos. */
const REFRESCO_MS = 60_000

export default function AnaliticaActividadPage() {
    const { user, logout } = useAuth()
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica(rangoHoy())
    const [visitaElegida, setVisitaElegida] = useState<number | null>(null)

    const enVivo = incluyeHoy(filtro.desde, filtro.hasta)
    const { data: roster } = useVendedores()
    const { data: resumen } = useResumen(filtro)
    const { data: pagina, isLoading, isError } = useVisitas(
        { desde: filtro.desde, hasta: filtro.hasta, vendedores: filtro.vendedores },
        { refrescarCada: enVivo ? REFRESCO_MS : 0 },
    )

    const opciones = (roster ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))

    const filas = pagina?.visitas ?? []
    const cerradas = filas.filter(f => f.tipo === 'visita' && f.fechaFin !== null).length
    const enCurso = filas.filter(f => f.tipo === 'visita' && f.fechaFin === null).length
    const noVisitas = filas.filter(f => f.tipo === 'no_visita').length

    const kpis = [
        { titulo: 'Visitas cerradas', valor: formatNumero(cerradas) },
        { titulo: 'En curso', valor: formatNumero(enCurso) },
        { titulo: 'No visitó', valor: formatNumero(noVisitas) },
        { titulo: 'Cobertura', valor: formatPct(resumen?.promedios.cobertura ?? null) },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs enVivo={enVivo} />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <FiltrosAnalitica
                filtro={filtro}
                vendedoresDisponibles={opciones}
                onRango={setRango}
                onToggleVendedor={toggleVendedor}
                onLimpiar={limpiarVendedores}
            />

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {kpis.map(k => (
                        <div
                            key={k.titulo}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                        >
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                {k.titulo}
                            </p>
                            <p className="mt-1 text-xl font-semibold text-slate-900">{k.valor}</p>
                        </div>
                    ))}
                </div>

                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {isError && (
                    <p className="text-sm text-red-600">No se pudo cargar la actividad.</p>
                )}

                {pagina && filas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin actividad entre {filtro.desde} y {filtro.hasta}.
                    </div>
                )}

                {filas.length > 0 && (
                    <TablaActividad filas={filas} onElegirVisita={setVisitaElegida} />
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
