import axios from 'axios'

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

apiClient.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            const code: string | undefined = error.response?.data?.code
            if (code?.startsWith('CRM_')) {
                return Promise.reject(error)
            }
            localStorage.removeItem('access_token')
            // This app has no /login route — an expired/missing token routes to
            // /sin-acceso (see ProtectedRoute.tsx). Avoid reloading there to prevent
            // a reload loop if that screen ever makes an authenticated request.
            if (window.location.pathname !== '/sin-acceso') {
                window.location.reload()
            }
        }
        return Promise.reject(error)
    },
)
