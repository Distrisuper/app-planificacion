import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { esRolAnalitica, esRolVendedor } from '@/lib/roles'

const useAuthMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => useAuthMock(),
}))

function renderAt(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<div>agenda</div>} />
                </Route>
                <Route path="/login" element={<div>login</div>} />
                <Route path="/sin-permisos" element={<div>sin permisos</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

function renderConRoles(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<ProtectedRoute permitirRol={esRolVendedor} />}>
                    <Route path="/" element={<div>agenda</div>} />
                </Route>
                <Route element={<ProtectedRoute permitirRol={esRolAnalitica} />}>
                    <Route path="/analitica" element={<div>analitica</div>} />
                </Route>
                <Route path="/login" element={<div>login</div>} />
                <Route path="/sin-permisos" element={<div>sin permisos</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

it('renders the child route when authenticated', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated' })
    renderAt('/')
    expect(screen.getByText('agenda')).toBeInTheDocument()
})

it('shows a loading placeholder while validating', () => {
    useAuthMock.mockReturnValue({ status: 'loading' })
    renderAt('/')
    expect(screen.queryByText('agenda')).not.toBeInTheDocument()
    expect(screen.queryByText('login')).not.toBeInTheDocument()
})

it('redirects to /sin-permisos when the role is not vendedor', () => {
    useAuthMock.mockReturnValue({ status: 'unauthorized' })
    renderAt('/')
    expect(screen.getByText('sin permisos')).toBeInTheDocument()
})

it('redirects to /login when there is no valid session', () => {
    useAuthMock.mockReturnValue({ status: 'unauthenticated' })
    renderAt('/')
    expect(screen.getByText('login')).toBeInTheDocument()
})

it('blocks a vendedor from /analitica and sends it to its own ruta inicial', () => {
    useAuthMock.mockReturnValue({
        status: 'authenticated',
        user: { name: 'Martín', rol: 'vendedor' },
        rutaInicial: '/',
    })
    renderConRoles('/analitica')
    expect(screen.getByText('agenda')).toBeInTheDocument()
    expect(screen.queryByText('analitica')).not.toBeInTheDocument()
})

it('blocks an analitica role from / and sends it to its own ruta inicial', () => {
    useAuthMock.mockReturnValue({
        status: 'authenticated',
        user: { name: 'Ana', rol: 'admin' },
        rutaInicial: '/analitica',
    })
    renderConRoles('/')
    expect(screen.getByText('analitica')).toBeInTheDocument()
    expect(screen.queryByText('agenda')).not.toBeInTheDocument()
})
