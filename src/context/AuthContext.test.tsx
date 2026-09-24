import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { queryClient } from '@/lib/queryClient'

vi.mock('@/api/authApi', () => ({
    login: vi.fn(),
    getMe: vi.fn(),
}))
vi.mock('@/api/planificacion', () => ({ getMePlanificacion: vi.fn() }))

import { login as loginApi, getMe } from '@/api/authApi'
import { getMePlanificacion } from '@/api/planificacion'

const ME_GERENCIA = {
    rol: 'admin',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true, veSusMetricas: true },
    vendedoresVisibles: null,
    vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2'] },
}
const ME_VENDEDOR = {
    rol: 'vendedor',
    capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas: true },
    vendedoresVisibles: ['V 2'],
    vendedorDePrueba: null,
}
const ME_NADA = {
    rol: 'marketing',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas: false },
    vendedoresVisibles: null,
    vendedorDePrueba: null,
}

function Probe() {
    const { status, user, capacidades, vendedorDePrueba, rutaInicial, loginError, login, logout, capacidadesNoCargadas, refrescarMe } = useAuth()
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
            <button onClick={() => void refrescarMe()}>refrescar</button>
            <div data-testid="nocargadas">{String(capacidadesNoCargadas)}</div>
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
        queryClient.clear()
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

    it('logout borra la visita en curso, los borradores y la caché: el próximo usuario no hereda nada', async () => {
        localStorage.setItem('access_token', 'tok')
        localStorage.setItem('visita-en-curso', JSON.stringify({ visitaId: 7, cliente: { codigo: 'DE-A' } }))
        localStorage.setItem('visita-borrador-7', '{}')
        localStorage.setItem('visita-inicio-7', '123')
        ;(getMe as any).mockResolvedValue({ name: 'A', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        // La agenda de A, fresca en caché: con staleTime de 5 min y refetchOnMount: false,
        // B la vería sin pedirla al servidor.
        queryClient.setQueryData(['agenda', 'semana'], { lunes: [{ codigo: 'DE-A', estado: 'en_curso' }] })

        await userEvent.click(screen.getByText('logout'))

        expect(localStorage.getItem('visita-en-curso')).toBeNull()
        expect(localStorage.getItem('visita-borrador-7')).toBeNull()
        expect(localStorage.getItem('visita-inicio-7')).toBeNull()
        expect(queryClient.getQueryData(['agenda', 'semana'])).toBeUndefined()
    })

    it('un token guardado que ya no valida también limpia lo local de esa sesión', async () => {
        localStorage.setItem('access_token', 'bad')
        localStorage.setItem('visita-en-curso', '{"visitaId":7}')
        ;(getMe as any).mockRejectedValue(new Error('401'))
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
        expect(localStorage.getItem('visita-en-curso')).toBeNull()
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
        expect(screen.getByTestId('nocargadas')).toHaveTextContent('true')
        expect(localStorage.getItem('access_token')).toBe('tok')
    })

    it('un fallo de /me se distingue de "sin capacidades", y reintentar con éxito autentica', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(ME_GERENCIA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('nocargadas')).toHaveTextContent('true'))
        await userEvent.click(screen.getByText('refrescar'))
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('nocargadas')).toHaveTextContent('false')
        expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
    })

    it('sin capacidades por rol NO marca capacidadesNoCargadas', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Mk', rol: 'marketing' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_NADA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
        expect(screen.getByTestId('nocargadas')).toHaveTextContent('false')
    })
})
