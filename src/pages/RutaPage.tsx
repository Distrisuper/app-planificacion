import { useState } from 'react'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import SelectorVendedor from '@/components/ruta/SelectorVendedor'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { useRotaciones } from '@/hooks/useRotacionAdmin'

/**
 * Edición de la ruta (rotación) de un vendedor, para gerencia.
 *
 * Mismo shell que las páginas de Analítica (header + tabs + AccountMenu) pero SIN
 * `FiltrosAnalitica`: ese filtro es rango de fechas + multi-vendedor, pensado para
 * reportes. Acá se opera sobre un vendedor y una rotación a la vez.
 */
export default function RutaPage() {
    const { user, logout } = useAuth()
    const [vendedor, setVendedor] = useState<string | null>(null)

    const { data: roster } = useVendedores()
    const { data: cola, isLoading, isError } = useRotaciones(vendedor)

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-white px-6 py-4">
                <SelectorVendedor
                    vendedores={roster ?? []}
                    elegido={vendedor}
                    onElegir={codigo => setVendedor(codigo === '' ? null : codigo)}
                />
            </div>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor === null && (
                    <p className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Elegí un vendedor para ver y editar su ruta.
                    </p>
                )}

                {vendedor !== null && isLoading && (
                    <p className="text-sm text-slate-500">Cargando…</p>
                )}

                {vendedor !== null && isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar la ruta de este vendedor. Probá de nuevo en un
                        momento.
                    </p>
                )}

                {vendedor !== null && cola?.length === 0 && (
                    <p className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Este vendedor todavía no tiene ninguna rotación.
                    </p>
                )}
            </main>
        </div>
    )
}
