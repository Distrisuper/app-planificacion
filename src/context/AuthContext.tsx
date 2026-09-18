import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { login as loginApi, getMe } from '@/api/authApi'
import { getMePlanificacion } from '@/api/planificacion'
import { rutaInicialPara } from '@/lib/roles'
import type { ICapacidades, IMePlanificacion, IVendedorDePrueba } from '@/types/planificacion'

type AuthStatus = 'loading' | 'authenticated' | 'unauthorized' | 'unauthenticated'

interface AuthUser {
    name: string
    rol: string
}

interface AuthContextValue {
    status: AuthStatus
    user: AuthUser | null
    capacidades: ICapacidades | null
    vendedoresVisibles: string[] | null
    vendedorDePrueba: IVendedorDePrueba | null
    /** Pantalla donde arranca el rol logueado. null si no tiene acceso. */
    rutaInicial: string | null
    loginError: string | null
    loginLoading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
    /** `/planificacion/me` no respondió (red, 5xx). El status queda `unauthorized` porque sin
     *  capacidades no hay acceso, pero la causa NO es el rol: /me devuelve 200 para cualquier
     *  token válido. SinPermisosPage lo usa para ofrecer reintentar en vez de solo cerrar sesión. */
    capacidadesNoCargadas: boolean
    /** Vuelve a pedir /planificacion/me: después de reiniciar la prueba (refresca la descripción)
     *  y como reintento cuando `capacidadesNoCargadas`. Si responde, recalcula el status. */
    refrescarMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
    return ctx
}

export function AuthProvider({ children }: PropsWithChildren) {
    const [status, setStatus] = useState<AuthStatus>('loading')
    const [user, setUser] = useState<AuthUser | null>(null)
    const [me, setMe] = useState<IMePlanificacion | null>(null)
    const [capacidadesNoCargadas, setCapacidadesNoCargadas] = useState(false)
    const [loginError, setLoginError] = useState<string | null>(null)
    const [loginLoading, setLoginLoading] = useState(false)

    async function validateAndSetUser(token: string) {
        try {
            const authMe = await getMe(token)
            setUser({ name: authMe.name, rol: authMe.rol })
        } catch {
            localStorage.removeItem('access_token')
            setUser(null)
            setMe(null)
            setCapacidadesNoCargadas(false)
            setStatus('unauthenticated')
            return
        }
        // Qué puede hacer lo dice planificación, no el rol: sin este dato no hay acceso.
        // Si falla, 'unauthorized' y no 'unauthenticated': el token es válido, lo que no
        // hay es una capacidad conocida — y no se adivina por rol.
        try {
            aplicarMe(await getMePlanificacion())
        } catch {
            setMe(null)
            setCapacidadesNoCargadas(true)
            setStatus('unauthorized')
        }
    }

    function aplicarMe(mePlan: IMePlanificacion) {
        setMe(mePlan)
        setCapacidadesNoCargadas(false)
        setStatus(rutaInicialPara(mePlan.capacidades) === null ? 'unauthorized' : 'authenticated')
    }

    async function refrescarMe() {
        try {
            aplicarMe(await getMePlanificacion())
        } catch {
            /* se conserva el último conocido; si nunca cargó, sigue `capacidadesNoCargadas` */
        }
    }

    useEffect(() => {
        const token = localStorage.getItem('access_token')
        if (!token) {
            setStatus('unauthenticated')
            return
        }
        validateAndSetUser(token)
    }, [])

    async function login(email: string, password: string) {
        setLoginLoading(true)
        setLoginError(null)
        try {
            const { token } = await loginApi(email, password)
            localStorage.setItem('access_token', token)
            await validateAndSetUser(token)
        } catch {
            setLoginError('Usuario o contraseña incorrectos')
        } finally {
            setLoginLoading(false)
        }
    }

    function logout() {
        localStorage.removeItem('access_token')
        setUser(null)
        setMe(null)
        setCapacidadesNoCargadas(false)
        setLoginError(null)
        setStatus('unauthenticated')
    }

    return (
        <AuthContext.Provider
            value={{
                status,
                user,
                capacidades: me?.capacidades ?? null,
                vendedoresVisibles: me?.vendedoresVisibles ?? null,
                vendedorDePrueba: me?.vendedorDePrueba ?? null,
                rutaInicial: rutaInicialPara(me?.capacidades),
                loginError,
                loginLoading,
                login,
                logout,
                capacidadesNoCargadas,
                refrescarMe,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}
