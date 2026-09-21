import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CarteraPage from './CarteraPage'
import * as api from '@/api/metricas'
import { MOCK_CLIENTES, MOCK_METRICAS } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Mariano Acosta' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false, veSusMetricas: true } }),
}))
function EspiaURL() { const l = useLocation(); return <div data-testid="url">{l.pathname + l.search}</div> }
function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/cartera']}>
                <Routes>
                    <Route path="/cartera" element={<CarteraPage />} />
                    <Route path="/" element={<EspiaURL />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}
beforeEach(() => { localStorage.clear(); ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS) })

describe('CarteraPage', () => {
    it('muestra título, selector, panel y barra de tabs', async () => {
        montar()
        expect(screen.getByRole('heading', { name: 'Mi cartera', level: 1 })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
        expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
    })
    it('cambiar a "Mes anterior" pide ese mes', async () => {
        montar()
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
        await waitFor(() => expect((api.getMetricas as any).mock.calls.some(([a]: any) => a.mes !== MOCK_METRICAS.mes)).toBe(true))
    })
    it('con visita en curso muestra la barra y al tocarla vuelve a la agenda con ?visita=abrir', async () => {
        localStorage.setItem('visita-en-curso', JSON.stringify({ visitaId: 9, cliente: { rotacionClienteId: 1, nombreCliente: 'REPUESTOS SUR', codigoParticularCliente: '1', codigoCliente: '1', dia: 1, estado: 'en_curso' } }))
        montar()
        fireEvent.click(screen.getByTestId('visita-en-curso-bar'))
        await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/?visita=abrir'))
    })
    it('tocar "Inactivo" abre el sheet de clientes', async () => {
        ;(api.getMetricasClientes as any).mockResolvedValue(MOCK_CLIENTES)
        montar()
        await waitFor(() => screen.getByRole('button', { name: /Inactivo/ }))
        fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
        await waitFor(() => expect(screen.getByText('Clientes inactivos')).toBeInTheDocument())
    })
})
