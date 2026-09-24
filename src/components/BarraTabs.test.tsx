import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BarraTabs from './BarraTabs'
const authMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authMock() }))
const caps = (veSusMetricas: boolean) => ({ capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas } })

describe('BarraTabs', () => {
    it('marca el tab activo según la ruta', () => {
        authMock.mockReturnValue(caps(true))
        render(<MemoryRouter initialEntries={['/cartera']}><BarraTabs /></MemoryRouter>)
        expect(screen.getByRole('link', { name: /Mi cartera/ })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: /Agenda/ })).not.toHaveAttribute('aria-current')
    })
    it('sin la capacidad no se pinta', () => {
        authMock.mockReturnValue(caps(false))
        render(<MemoryRouter><BarraTabs /></MemoryRouter>)
        expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
    })
})
