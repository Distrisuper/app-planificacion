import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { login as loginApi, getMe } from '@/api/authApi'

type AuthStatus = 'loading' | 'authenticated' | 'unauthorized' | 'unauthenticated'

interface AuthUser {
    name: string
    rol: string
}

interface AuthContextValue {
    status: AuthStatus
    user: AuthUser | null
    loginError: string | null
    loginLoading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
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
    const [loginError, setLoginError] = useState<string | null>(null)
    const [loginLoading, setLoginLoading] = useState(false)

    async function validateAndSetUser(token: string) {
        try {
            const me = await getMe(token)
            const authUser = { name: me.name, rol: me.rol }
            if (me.rol?.toLowerCase() !== 'vendedor') {
                setUser(authUser)
                setStatus('unauthorized')
                return
            }
            setUser(authUser)
            setStatus('authenticated')
        } catch {
            localStorage.removeItem('access_token')
            setUser(null)
            setStatus('unauthenticated')
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
        setLoginError(null)
        setStatus('unauthenticated')
    }

    return (
        <AuthContext.Provider value={{ status, user, loginError, loginLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}
