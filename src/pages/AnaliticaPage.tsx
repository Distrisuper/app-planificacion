import { useNavigate } from 'react-router-dom'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import KpisEquipo from '@/components/analitica/KpisEquipo'
import TablaVendedores from '@/components/analitica/TablaVendedores'
import ObjecionesMercado from '@/components/analitica/ObjecionesMercado'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import { useAuth } from '@/context/AuthContext'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useResumen, useVendedores } from '@/hooks/useAnalitica'

export default function AnaliticaPage() {
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica()
    const { data, isLoading, isError } = useResumen(filtro)
    const { data: roster } = useVendedores()

    const opciones = (roster ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))

    const irAVendedor = (codigo: string) => {
        const params = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta })
        navigate(`/analitica/vendedor/${codigo}?${params}`)
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
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
                {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

                {isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar la analítica. Probá de nuevo en un momento.
                    </p>
                )}

                {data && data.vendedores.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
                        <p className="text-sm text-slate-600">
                            No hay ciclos entre {filtro.desde} y {filtro.hasta}.
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Probá con otro rango de fechas.
                        </p>
                    </div>
                )}

                {data && data.vendedores.length > 0 && (
                    <>
                        <KpisEquipo
                            promedios={data.promedios}
                            cantidadVendedores={data.vendedores.length}
                        />
                        <TablaVendedores
                            vendedores={data.vendedores}
                            promedios={data.promedios}
                            onElegirVendedor={irAVendedor}
                        />
                        <ObjecionesMercado desde={filtro.desde} hasta={filtro.hasta} />
                    </>
                )}
            </main>
        </div>
    )
}
