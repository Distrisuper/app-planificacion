import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

function renderAt(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<div>agenda</div>} />
                </Route>
                <Route path="/sin-acceso" element={<div>sin acceso</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

it('renders the child route when a token exists', () => {
    localStorage.setItem('access_token', 'tok')
    renderAt('/')
    expect(screen.getByText('agenda')).toBeInTheDocument()
})

it('redirects to /sin-acceso when there is no token', () => {
    localStorage.removeItem('access_token')
    renderAt('/')
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
})
