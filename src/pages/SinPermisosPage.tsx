import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function SinPermisosPage() {
    const { status, rutaInicial, capacidadesNoCargadas, refrescarMe, logout } = useAuth()

    // Un reintento exitoso deja el status en authenticated: esta ruta vive fuera de
    // ProtectedRoute, así que el redirect es propio.
    if (status === 'authenticated') return <Navigate to={rutaInicial ?? '/'} replace />

    // No es lo mismo "no tenés capacidades" que "no pudimos preguntar": /planificacion/me
    // responde 200 a cualquier token válido, así que un fallo acá es red o servidor. Mandar
    // a cerrar sesión a un vendedor con mala señal lo deja afuera hasta que recuerde la clave.
    if (capacidadesNoCargadas) {
        return (
            <div className="min-h-full grid place-items-center p-6 text-center">
                <div>
                    <p className="text-dsmuted">No pudimos cargar tus permisos. Revisá la conexión y volvé a intentar.</p>
                    <div className="mt-4 flex justify-center gap-2">
                        <button
                            onClick={() => void refrescarMe()}
                            className="rounded-md bg-dsnavy px-4 py-2 text-white hover:bg-dsnavy/90"
                        >
                            Reintentar
                        </button>
                        <button
                            onClick={logout}
                            className="rounded-md border border-dsline px-4 py-2 text-dsnavy hover:bg-[#F1F4F9]"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-full grid place-items-center p-6 text-center">
            <div>
                <p className="text-dsmuted">Tu usuario no tiene permisos de vendedor para acceder a esta aplicación.</p>
                <button
                    onClick={logout}
                    className="mt-4 rounded-md bg-dsnavy px-4 py-2 text-white hover:bg-dsnavy/90"
                >
                    Volver a intentar
                </button>
            </div>
        </div>
    )
}
