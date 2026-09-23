import { useState } from 'react'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import TablaFichas from '@/components/analitica/TablaFichas'
import AccountMenu from '@/components/AccountMenu'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useVendedores } from '@/hooks/useAnalitica'
import { useCamposFicha } from '@/hooks/useCamposFicha'
import { useFichasRelevadas } from '@/hooks/useFichasRelevadas'
import { buscarFichas } from '@/lib/buscarFichas'

/**
 * "Datos del comercio": qué se cargó, de quién y cuándo.
 *
 * Es una pantalla de INSPECCIÓN, no de agregación: lo primero que gerencia necesita saber del
 * relevamiento es qué está entrando y si sirve — un vendedor que pone "Generalista" en los
 * treinta clientes de la semana se ve mirando las filas, no un porcentaje.
 */
export default function AnaliticaFichasPage() {
    const [busqueda, setBusqueda] = useState('')
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()
    const { filtro, hayRango, setRango, toggleVendedor, limpiarVendedores, limpiarRango } =
        useFiltroAnalitica()

    // **El período arranca en "todo"**, al revés que las otras tabs. La ficha es un padrón
    // acumulado que se llena una vez por cliente y nunca más, así que con el default de
    // ellas (la semana en curso) esta pantalla abriría con cuatro filas. El rango se aplica
    // sólo si está EN LA URL, o sea si el usuario lo eligió; `useFiltroAnalitica` siempre
    // devuelve uno para poder dibujar el selector, pero ése es su default, no una elección.
    const args = {
        ...(hayRango ? { desde: filtro.desde, hasta: filtro.hasta } : {}),
        vendedores: filtro.vendedores,
    }

    const { data: roster } = useVendedores()
    const { data: catalogo } = useCamposFicha()
    const { data, isLoading, isError } = useFichasRelevadas(args)

    const visibles = data ? buscarFichas(data.fichas, busqueda) : []

    const opciones = (roster ?? []).map(v => ({
        codigo: v.codigoParticularVendedor,
        nombre: v.nombreVendedor,
    }))

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>

            <FiltrosAnalitica
                filtro={filtro}
                vendedoresDisponibles={opciones}
                onRango={setRango}
                onToggleVendedor={toggleVendedor}
                onLimpiar={limpiarVendedores}
                onTodoElPeriodo={limpiarRango}
                sinRango={!hayRango}
            />

            <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
                {data && data.fichas.length > 0 && (
                    <input
                        type="search"
                        aria-label="Buscar cliente"
                        placeholder="Buscar por código o nombre de cliente"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    />
                )}

                {(isLoading || !catalogo) && !isError && (
                    <p className="text-sm text-slate-500">Cargando…</p>
                )}

                {isError && (
                    <p className="text-sm text-red-600">
                        No se pudieron cargar los datos del comercio.
                    </p>
                )}

                {data && data.fichas.length === 0 && !isLoading && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Todavía no se cargó ningún dato del comercio
                        {hayRango && ' en este período'}.
                    </div>
                )}

                {/* Sin catálogo NO se dibuja: los valores son códigos (`'3'`, `'ford'`) y el
                    label sale de ahí. Mostrar la tabla antes de tenerlo pintaría códigos
                    crudos, que es peor que esperar — y como se cachea con staleTime infinito,
                    esta espera pasa una sola vez por sesión. */}
                {data && data.fichas.length > 0 && visibles.length === 0 && (
                    <p className="text-sm text-slate-500">Ningún cliente coincide con “{busqueda}”.</p>
                )}

                {data && catalogo && visibles.length > 0 && (
                    <TablaFichas fichas={visibles} catalogo={catalogo} />
                )}
            </main>
        </div>
    )
}
