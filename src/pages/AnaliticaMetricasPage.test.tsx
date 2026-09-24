import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AnaliticaMetricasPage from './AnaliticaMetricasPage'
import * as metricas from '@/api/metricas'
import * as analitica from '@/api/analitica'
import { MOCK_METRICAS, MOCK_METRICAS_EQUIPO } from '@/mocks/metricasMock'
import { MOCK_VENDEDORES } from '@/mocks/analiticaMock'
vi.mock('@/api/metricas')
vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Gerente' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true, veSusMetricas: true } }),
}))
function EspiaURL() { const l = useLocation(); return <div data-testid="url">{l.search}</div> }
function montar(url = '/analitica/metricas') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[url]}>
                <Routes><Route path="/analitica/metricas" element={<><AnaliticaMetricasPage /><EspiaURL /></>} /></Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}
beforeEach(() => {
    ;(analitica.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
    ;(metricas.getMetricas as any).mockImplementation(async (a: any) => a.vendedor === 'equipo' ? MOCK_METRICAS_EQUIPO : { ...MOCK_METRICAS, sujeto: { tipo: 'vendedor', codigo: a.vendedor, nombre: 'ACOSTA MARIANO' } })
})

describe('AnaliticaMetricasPage', () => {
    it('arranca en Equipo y pinta la pestaña activa', async () => {
        montar()
        expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('button', { name: 'Equipo' })).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Equipo · mes' })).toBeInTheDocument())
        expect(metricas.getMetricas).toHaveBeenCalledWith(expect.objectContaining({ vendedor: 'equipo' }))
    })
    it('elegir un vendedor cambia el sujeto y la URL', async () => {
        montar()
        await waitFor(() => screen.getByRole('button', { name: MOCK_VENDEDORES[0].nombreVendedor }))
        fireEvent.click(screen.getByRole('button', { name: MOCK_VENDEDORES[0].nombreVendedor }))
        await waitFor(() => expect(screen.getByRole('heading', { name: 'ACOSTA MARIANO · mes' })).toBeInTheDocument())
        expect(screen.getByTestId('url')).toHaveTextContent(`vendedor=${encodeURIComponent(MOCK_VENDEDORES[0].codigoParticularVendedor)}`)
    })
    it('respeta ?vendedor= y ?mes= de la URL', async () => {
        montar(`/analitica/metricas?vendedor=${encodeURIComponent(MOCK_VENDEDORES[1].codigoParticularVendedor)}&mes=2026-08`)
        await waitFor(() => expect(metricas.getMetricas).toHaveBeenCalledWith({ mes: '2026-08', vendedor: MOCK_VENDEDORES[1].codigoParticularVendedor }))
    })
})
