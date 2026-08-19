import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import EfectividadOperativaSection from '@/components/analitica/EfectividadOperativaSection'
import AccountMenu from '@/components/AccountMenu'
import { useAuth } from '@/context/AuthContext'

export default function AnaliticaPage() {
    const { user, logout } = useAuth()

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <EfectividadOperativaSection />
            </main>
        </div>
    )
}
