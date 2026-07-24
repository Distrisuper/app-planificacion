import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function ProtectedRoute() {
    const { status } = useAuth()

    if (status === 'loading') {
        return <div className="min-h-full grid place-items-center text-dsmuted">Cargando...</div>
    }
    if (status === 'unauthorized') return <Navigate to="/sin-permisos" replace />
    if (status === 'unauthenticated') return <Navigate to="/login" replace />
    return <Outlet />
}
