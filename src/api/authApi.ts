import axios from 'axios'

const authUrl: string = import.meta.env.VITE_API_AUTH_URL || ''

const authApiClient = axios.create({
    baseURL: authUrl,
    headers: { 'Content-Type': 'application/json' },
})

export interface IAuthUser {
    id: number
    name: string
    surname?: string
    email: string
    rol: string
    codigoparticular?: string | null
}

export async function login(email: string, password: string): Promise<{ token: string }> {
    const res = await authApiClient.post('/api/lupita/login', { email, password })
    if (res.data?.message !== 'success') {
        throw new Error('Usuario o contraseña incorrectos')
    }
    return { token: res.data.access_token }
}

export async function getMe(token: string): Promise<IAuthUser> {
    const res = await authApiClient.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
    })
    return res.data
}
