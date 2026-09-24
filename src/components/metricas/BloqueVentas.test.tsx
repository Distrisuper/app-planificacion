import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import BloqueVentas from './BloqueVentas'
import { MOCK_RESUMEN_METRICAS } from '@/mocks/metricasMock'

const q = (over: any = {}) => ({ data: MOCK_RESUMEN_METRICAS, isLoading: false, isError: false, refetch: vi.fn(), ...over }) as any

it('muestra el equipo con objetivos × cantidad de vendedores', () => {
    render(<BloqueVentas query={q()} proyectado={false} />)
    // 3 vendedores × 150 $M = 450
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('/ 450')
})

it('con vendedor muestra su fila y objetivo individual', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado={false} />)
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('132 / 150')
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('+10% vs año anterior')
})

it('tasa de cierre = visitados con compra / visitados', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado={false} />)
    // 61 / 119 = 51%
    expect(screen.getByText('51%')).toBeInTheDocument()
})

it('rentabilidad null fuera de mes se muestra s/d', () => {
    const data = { ...MOCK_RESUMEN_METRICAS, mesCompleto: false, equipo: { ...MOCK_RESUMEN_METRICAS.equipo, rentabilidad: null } }
    render(<BloqueVentas query={q({ data })} proyectado={false} />)
    expect(screen.getByTestId('tile-rentabilidad')).toHaveTextContent('s/d')
})

it('proyectado escala la facturación y lo aclara', () => {
    render(<BloqueVentas query={q()} vendedor="V 2" proyectado />)
    // 132 × 22/13 = 223,4
    expect(screen.getByTestId('tile-facturacion')).toHaveTextContent('223,4')
    expect(screen.getByText(/proyectado a fin de mes/i)).toBeInTheDocument()
})

it('error ofrece reintentar', async () => {
    const refetch = vi.fn()
    render(<BloqueVentas query={q({ data: undefined, isError: true, refetch })} proyectado={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    expect(refetch).toHaveBeenCalled()
})

it('cartera vacía: mensaje explícito', () => {
    const data = { ...MOCK_RESUMEN_METRICAS, vendedores: [], equipo: { ...MOCK_RESUMEN_METRICAS.equipo, cartera: 0 } }
    render(<BloqueVentas query={q({ data })} proyectado={false} />)
    expect(screen.getByText('Sin clientes para estos filtros.')).toBeInTheDocument()
})

it('cargando muestra un spinner', () => {
    render(<BloqueVentas query={q({ data: undefined, isLoading: true })} proyectado={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
})
