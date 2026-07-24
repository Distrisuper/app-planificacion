import { useAuth } from '@/context/AuthContext'

export default function SinPermisosPage() {
    const { logout } = useAuth()

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
