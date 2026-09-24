import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DetalleClientesSheet from './DetalleClientesSheet'
import * as api from '@/api/metricas'
import { MOCK_CLIENTES } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')
const montar = (ui: React.ReactElement) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}
describe('DetalleClientesSheet', () => {
    it('cerrado no pide nada', () => {
        montar(<DetalleClientesSheet detalle={null} mes="2026-09" onClose={() => {}} />)
        expect(api.getMetricasClientes).not.toHaveBeenCalled()
    })
    it('abierto lista clientes con actual, promedio y variación', async () => {
        ;(api.getMetricasClientes as any).mockResolvedValue(MOCK_CLIENTES)
        montar(<DetalleClientesSheet detalle={{ estado: 'Inactivo', titulo: 'Inactivo' }} mes="2026-09" onClose={() => {}} />)
        expect(screen.getByText('Clientes inactivos')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('MUNDO AUTOPARTES SRL')).toBeInTheDocument())
        expect(api.getMetricasClientes).toHaveBeenCalledWith({ mes: '2026-09', vendedor: undefined, estado: 'Inactivo' })
        expect(screen.getByText('$88,1M')).toBeInTheDocument()
        expect(screen.getByText('▼ 42%')).toBeInTheDocument()
        expect(screen.getByText('4 clientes')).toBeInTheDocument()
    })
    it('caida: título propio', () => {
        ;(api.getMetricasClientes as any).mockResolvedValue([])
        montar(<DetalleClientesSheet detalle={{ estado: 'caida', titulo: 'X' }} mes="2026-09" onClose={() => {}} />)
        expect(screen.getByText('Clientes en caída')).toBeInTheDocument()
    })
})
