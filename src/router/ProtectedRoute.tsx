import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface ProtectedRouteProps {
    /** Además de estar logueado, el rol tiene que cumplir esto para entrar a este
     *  grupo de rutas. Sin esta prop solo se valida sesión (compatibilidad hacia atrás). */
    permitirRol?: (rol: string | undefined) => boolean
}

export default function ProtectedRoute({ permitirRol }: ProtectedRouteProps) {
    const { status, user, rutaInicial } = useAuth()

    if (status === 'loading') {
        return <div className="min-h-full grid place-items-center text-dsmuted">Cargando...</div>
    }
    if (status === 'unauthorized') return <Navigate to="/sin-permisos" replace />
    if (status === 'unauthenticated') return <Navigate to="/login" replace />
    // Logueado pero con un rol que no es el de este grupo de rutas (ej. un vendedor
    // entrando a /analitica): se lo manda a la pantalla que sí le corresponde.
    if (permitirRol && !permitirRol(user?.rol)) {
        return <Navigate to={rutaInicial ?? '/'} replace />
    }
    return <Outlet />
}
