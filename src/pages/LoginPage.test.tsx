import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import LoginPage from './LoginPage'

const useAuthMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => useAuthMock(),
}))

function renderLoginPage() {
    render(
        <MemoryRouter initialEntries={['/login']}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<div>home</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

describe('LoginPage', () => {
    beforeEach(() => vi.clearAllMocks())

    it('submits the form values via login', async () => {
        const login = vi.fn()
        useAuthMock.mockReturnValue({ status: 'unauthenticated', login, loginLoading: false, loginError: null })
        renderLoginPage()

        await userEvent.type(screen.getByLabelText('Usuario'), 'vendedor@x.com')
        await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta')
        await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

        expect(login).toHaveBeenCalledWith('vendedor@x.com', 'secreta')
    })

    it('shows the login error when present', () => {
        useAuthMock.mockReturnValue({
            status: 'unauthenticated',
            login: vi.fn(),
            loginLoading: false,
            loginError: 'Usuario o contraseña incorrectos',
        })
        renderLoginPage()
        expect(screen.getByText('Usuario o contraseña incorrectos')).toBeInTheDocument()
    })

    it('redirects to / when already authenticated', () => {
        useAuthMock.mockReturnValue({ status: 'authenticated', login: vi.fn(), loginLoading: false, loginError: null })
        renderLoginPage()
        expect(screen.getByText('home')).toBeInTheDocument()
    })
})
