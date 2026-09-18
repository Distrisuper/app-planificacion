import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import EfectividadOperativaSection from '@/components/analitica/EfectividadOperativaSection'
import AccountMenu from '@/components/AccountMenu'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'

export default function AnaliticaPage() {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()

    return (
        <div className="min-h-screen bg-slate-50">
            {/* El bloque de navegación y filtros queda fijo al scrollear: las tablas de gerencia
                son largas y sin esto tabs y filtros desaparecen a la primera pantalla. */}
            <div className="sticky top-0 z-20 bg-white">
                <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                    <div className="flex-1">
                        <AnaliticaTabs />
                    </div>
                    <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
                </header>
            </div>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <EfectividadOperativaSection />
            </main>
        </div>
    )
}
