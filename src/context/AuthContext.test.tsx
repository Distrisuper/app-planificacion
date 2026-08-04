import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('@/api/authApi', () => ({
    login: vi.fn(),
    getMe: vi.fn(),
}))

import { login as loginApi, getMe } from '@/api/authApi'

function Probe() {
    const { status, user, rutaInicial, loginError, login, logout } = useAuth()
    return (
        <div>
            <div data-testid="status">{status}</div>
            <div data-testid="user">{user ? `${user.name}:${user.rol}` : ''}</div>
            <div data-testid="ruta">{rutaInicial ?? 'ninguna'}</div>
            <div data-testid="error">{loginError ?? ''}</div>
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
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('user')).toHaveTextContent('Martín:vendedor')
        expect(screen.getByTestId('ruta')).toHaveTextContent('/')
    })

    it('authenticates a rol with unrestricted scope (analitica) and points it at /analitica', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('user')).toHaveTextContent('Ana:admin')
        expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
        expect(localStorage.getItem('access_token')).toBe('tok')
    })

    it('sets status to unauthorized when rol has no known access, without clearing the token', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Marketing', rol: 'marketing' })
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
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        await userEvent.click(screen.getByText('logout'))
        expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
        expect(localStorage.getItem('access_token')).toBeNull()
    })
})
