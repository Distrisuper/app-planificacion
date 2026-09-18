import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { puedeOperarComoVendedor, supervisa } from '@/lib/roles'

const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))

const cap = (v: boolean, p: boolean, s: boolean) => ({
    operaComoVendedor: v, operaComoVendedorDePrueba: p, superviseVendedores: s,
})

function montar(ruta: string, capacidades: ReturnType<typeof cap>) {
    auth.mockReturnValue({
        status: 'authenticated',
        capacidades,
        rutaInicial: supervisa(capacidades) ? '/analitica' : puedeOperarComoVendedor(capacidades) ? '/' : null,
    })
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route element={<ProtectedRoute permitir={puedeOperarComoVendedor} />}>
                    <Route path="/" element={<div>AGENDA</div>} />
                </Route>
                <Route element={<ProtectedRoute permitir={supervisa} />}>
                    <Route path="/analitica" element={<div>ANALITICA</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    )
}

describe('ProtectedRoute por capacidades', () => {
    it('gerencia entra a / y a /analitica', () => {
        montar('/', cap(false, true, true))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('gerencia entra a /analitica', () => {
        montar('/analitica', cap(false, true, true))
        expect(screen.getByText('ANALITICA')).toBeInTheDocument()
    })
    it('tester entra a / pero /analitica lo manda a /', () => {
        montar('/analitica', cap(false, true, false))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('vendedor entra a / pero /analitica lo manda a /', () => {
        montar('/analitica', cap(true, false, false))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('un TV futuro entra a /analitica y / lo manda a /analitica', () => {
        montar('/', cap(false, false, true))
        expect(screen.getByText('ANALITICA')).toBeInTheDocument()
    })
})
