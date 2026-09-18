import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('@/api/authApi', () => ({
    login: vi.fn(),
    getMe: vi.fn(),
}))
vi.mock('@/api/planificacion', () => ({ getMePlanificacion: vi.fn() }))

import { login as loginApi, getMe } from '@/api/authApi'
import { getMePlanificacion } from '@/api/planificacion'

const ME_GERENCIA = {
    rol: 'admin',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
    vendedoresVisibles: null,
    vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2'] },
}
const ME_VENDEDOR = {
    rol: 'vendedor',
    capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false },
    vendedoresVisibles: ['V 2'],
    vendedorDePrueba: null,
}
const ME_NADA = {
    rol: 'marketing',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    vendedoresVisibles: null,
    vendedorDePrueba: null,
}

function Probe() {
    const { status, user, capacidades, vendedorDePrueba, rutaInicial, loginError, login, logout } = useAuth()
    return (
        <div>
            <div data-testid="status">{status}</div>
            <div data-testid="user">{user ? `${user.name}:${user.rol}` : ''}</div>
            <div data-testid="ruta">{rutaInicial ?? 'ninguna'}</div>
            <div data-testid="error">{loginError ?? ''}</div>
            <div data-testid="prueba">{vendedorDePrueba?.codigo ?? ''}</div>
            <div data-testid="cap">{capacidades ? JSON.stringify(capacidades) : ''}</div>
            <button onClick={() => login('user@x.com', 'pass')}>login</button>
            <button onClick={logout}>logout</button>
        </div>
    )
}

function renderProbe() {
    render(
        <AuthProvider>
            <Probe />
        </AuthProvider>,
    )
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
    })

    it('starts unauthenticated when there is no stored token', async () => {
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    })

    it('validates a stored token on mount and authenticates when rol is vendedor', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Martín', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('user')).toHaveTextContent('Martín:vendedor')
        expect(screen.getByTestId('ruta')).toHaveTextContent('/')
    })

    it('authenticates a rol with unrestricted scope (analitica) and points it at /analitica', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_GERENCIA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('user')).toHaveTextContent('Ana:admin')
        expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
        expect(localStorage.getItem('access_token')).toBe('tok')
    })

    it('sets status to unauthorized when rol has no known access, without clearing the token', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Marketing', rol: 'marketing' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_NADA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
        expect(screen.getByTestId('user')).toHaveTextContent('Marketing:marketing')
        expect(screen.getByTestId('ruta')).toHaveTextContent('ninguna')
        expect(localStorage.getItem('access_token')).toBe('tok')
    })

    it('treats a failed validation (invalid token / network error) as unauthenticated and clears the token', async () => {
        localStorage.setItem('access_token', 'bad')
        ;(getMe as any).mockRejectedValue(new Error('401'))
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
        expect(localStorage.getItem('access_token')).toBeNull()
    })

    it('login stores the token and authenticates on success', async () => {
        ;(loginApi as any).mockResolvedValue({ token: 'newtok' })
        ;(getMe as any).mockResolvedValue({ name: 'Martín', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
        await userEvent.click(screen.getByText('login'))
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(localStorage.getItem('access_token')).toBe('newtok')
    })

    it('login sets loginError on bad credentials', async () => {
        ;(loginApi as any).mockRejectedValue(new Error('bad creds'))
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
        await userEvent.click(screen.getByText('login'))
        await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Usuario o contraseña incorrectos'))
    })

    it('logout clears the token and resets status', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Martín', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        await userEvent.click(screen.getByText('logout'))
        expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
        expect(localStorage.getItem('access_token')).toBeNull()
    })

    it('valida el token, pide /planificacion/me y autentica a un vendedor en /', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Martín', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('ruta')).toHaveTextContent('/')
        expect(screen.getByTestId('prueba')).toHaveTextContent('')
    })

    it('gerencia arranca en /analitica y trae su vendedor de prueba', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_GERENCIA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
        expect(screen.getByTestId('prueba')).toHaveTextContent('PRUEBA-42')
    })

    it('sin capacidades queda unauthorized (no se adivina nada por rol)', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Mk', rol: 'marketing' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_NADA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
    })

    it('si /planificacion/me falla, queda unauthorized y no se inventa acceso por rol', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockRejectedValue(new Error('500'))
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
    })
})
