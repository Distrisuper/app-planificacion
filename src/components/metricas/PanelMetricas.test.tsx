import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PanelMetricas from './PanelMetricas'
import SelectorMes from './SelectorMes'
import * as api from '@/api/metricas'
import { MOCK_METRICAS } from '@/mocks/metricasMock'
vi.mock('@/api/metricas')

function montar(ui: React.ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('PanelMetricas', () => {
    it('renderiza las secciones en el orden del catálogo con títulos propios', async () => {
        ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS)
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
        const titulos = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
        expect(titulos).toEqual(['Mi mes', 'Mis visitas', 'Mi cartera'])
        expect(screen.getByText(/Datos actualizados:/)).toBeInTheDocument()
    })
    it('con !propio usa el nombre del sujeto', async () => {
        ;(api.getMetricas as any).mockResolvedValue({ ...MOCK_METRICAS, sujeto: { tipo: 'vendedor', codigo: 'V 2', nombre: 'ACOSTA' } })
        montar(<PanelMetricas mes="2026-09" vendedor="V 2" propio={false} />)
        await waitFor(() => expect(screen.getByRole('heading', { name: 'ACOSTA · mes' })).toBeInTheDocument())
    })
    it('sin ventas: los tiles de cartera dicen "Sin datos por ahora"', async () => {
        ;(api.getMetricas as any).mockResolvedValue({ ...MOCK_METRICAS, ventas: null, fuentes: { ventas: 'no_disponible' } })
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getAllByText('Sin datos por ahora')).toHaveLength(5))
        expect(screen.getByText('Facturación')).toBeInTheDocument()
    })
    it('error: aviso con reintento y esqueletos', async () => {
        ;(api.getMetricas as any).mockRejectedValueOnce(new Error('x')).mockResolvedValue(MOCK_METRICAS)
        montar(<PanelMetricas mes="2026-09" propio />)
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus métricas.'))
        expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
        fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
        await waitFor(() => expect(screen.getByText('Visitas')).toBeInTheDocument())
    })
    it('tocar una fila con detalle avisa estado y título', async () => {
        ;(api.getMetricas as any).mockResolvedValue(MOCK_METRICAS)
        const onDetalle = vi.fn()
        montar(<PanelMetricas mes="2026-09" propio onDetalle={onDetalle} />)
        await waitFor(() => screen.getByRole('button', { name: /Inactivo/ }))
        fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
        expect(onDetalle).toHaveBeenCalledWith({ estado: 'Inactivo', titulo: 'Inactivo' })
        fireEvent.click(screen.getByRole('button', { name: /MUNDO AUTOPARTES/ }))
        expect(onDetalle).toHaveBeenCalledWith({ estado: 'caida', titulo: 'MUNDO AUTOPARTES SRL' })
        // Las objeciones no tienen detalle: no son botones
        expect(screen.queryByRole('button', { name: /Precio/ })).toBeNull()
    })
})

describe('SelectorMes', () => {
    it('dos chips, el activo con aria-pressed', () => {
        const onCambiar = vi.fn()
        const { rerender } = render(<SelectorMes mes="2026-09" onCambiar={onCambiar} />)
        // Este test corre con TZ de negocio; "este mes" es el de hoy real, así que lo calculamos
        const hoy = new Date()
        const esteMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
        rerender(<SelectorMes mes={esteMes} onCambiar={onCambiar} />)
        expect(screen.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
        expect(onCambiar).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/))
    })
})
