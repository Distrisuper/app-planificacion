import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ICapacidades } from '@/types/planificacion'

interface ProtectedRouteProps {
    /** Además de estar logueado, las capacidades tienen que cumplir esto para entrar a este
     *  grupo de rutas. Capacidades, no rol: el front no tiene tabla de roles. */
    permitir?: (capacidades: ICapacidades | null) => boolean
}

export default function ProtectedRoute({ permitir }: ProtectedRouteProps) {
    const { status, capacidades, rutaInicial } = useAuth()

    if (status === 'loading') {
        return <div className="min-h-full grid place-items-center text-dsmuted">Cargando...</div>
    }
    if (status === 'unauthorized') return <Navigate to="/sin-permisos" replace />
    if (status === 'unauthenticated') return <Navigate to="/login" replace />
    // Logueado pero sin la capacidad de este grupo (ej. un tester entrando a /analitica):
    // se lo manda a la pantalla que sí le corresponde.
    if (permitir && !permitir(capacidades)) {
        return <Navigate to={rutaInicial ?? '/'} replace />
    }
    return <Outlet />
}
