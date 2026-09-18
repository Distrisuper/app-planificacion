import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SinPermisosPage from './SinPermisosPage'

const useAuthMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => useAuthMock(),
}))

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/sin-permisos']}>
            <Routes>
                <Route path="/sin-permisos" element={<SinPermisosPage />} />
                <Route path="/analitica" element={<div>analitica</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

it('si /me no respondió, ofrece reintentar (no solo cerrar sesión) y no habla de permisos', async () => {
    const refrescarMe = vi.fn().mockResolvedValue(undefined)
    const logout = vi.fn()
    useAuthMock.mockReturnValue({ status: 'unauthorized', capacidadesNoCargadas: true, refrescarMe, logout })
    renderPage()
    expect(screen.getByText(/No pudimos cargar tus permisos/)).toBeInTheDocument()
    expect(screen.queryByText(/no tiene permisos de vendedor/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refrescarMe).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
})

it('cuando el reintento autentica, redirige a la ruta inicial', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated', rutaInicial: '/analitica', capacidadesNoCargadas: false, logout: vi.fn() })
    renderPage()
    expect(screen.getByText('analitica')).toBeInTheDocument()
})

it('shows the role message and calls logout on retry', async () => {
    const logout = vi.fn()
    useAuthMock.mockReturnValue({ status: 'unauthorized', capacidadesNoCargadas: false, logout })
    renderPage()
    expect(screen.getByText(/no tiene permisos de vendedor/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /volver a intentar/i }))
    expect(logout).toHaveBeenCalledTimes(1)
})
