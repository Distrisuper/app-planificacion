import axios from 'axios'
import { fixMojibake } from '@/lib/textFormat'

const apiUrl: string = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
    baseURL: apiUrl,
    headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

/** Recorre cualquier payload de respuesta arreglando strings con mojibake.
 *  Va acá y no en cada componente porque la corrupción es un problema de datos
 *  (filas viejas de MySQL), no de una pantalla puntual: cualquier endpoint que
 *  devuelva texto con acentos puede traerla. */
function deepFixMojibake(value: unknown): unknown {
    if (typeof value === 'string') return fixMojibake(value)
    if (Array.isArray(value)) return value.map(deepFixMojibake)
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, val]) => [key, deepFixMojibake(val)]),
        )
    }
    return value
}

apiClient.interceptors.response.use(
    response => {
        response.data = deepFixMojibake(response.data)
        return response
    },
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('access_token')
            // An expired/missing token routes to /login (see ProtectedRoute.tsx).
            // Avoid reloading there to prevent a reload loop if that screen ever
            // makes an authenticated request.
            if (window.location.pathname !== '/login') {
                window.location.reload()
            }
        }
        return Promise.reject(error)
    },
)
