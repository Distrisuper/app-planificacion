import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import EncabezadoAnalitica from './EncabezadoAnalitica'

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

const montar = (ui: React.ReactNode) =>
    render(<MemoryRouter initialEntries={['/analitica']}>{ui}</MemoryRouter>)

it('tabs, menú de cuenta y la barra de la pantalla van JUNTOS en el bloque fijo', () => {
    montar(
        <EncabezadoAnalitica>
            <div>barra de filtros</div>
        </EncabezadoAnalitica>,
    )
    const bloque = screen.getByTestId('encabezado-analitica')
    expect(bloque).toHaveClass('sticky', 'top-0')
    expect(bloque).toContainElement(screen.getByRole('link', { name: 'Métricas' }))
    expect(bloque).toContainElement(screen.getByText('barra de filtros'))
    expect(bloque).toContainElement(screen.getByLabelText('Cuenta'))
})

it('con `filtros`, tabs, filtros de la pantalla y cuenta van en UNA sola línea', () => {
    montar(<EncabezadoAnalitica filtros={<button type="button">Mes</button>} />)
    const linea = screen.getByRole('banner')
    expect(linea).toContainElement(screen.getByRole('link', { name: 'Métricas' }))
    expect(linea).toContainElement(screen.getByRole('button', { name: 'Mes' }))
    expect(linea).toContainElement(screen.getByLabelText('Cuenta'))
})

it('con `izquierda` reemplaza las tabs (el detalle del vendedor lleva "Volver")', () => {
    montar(<EncabezadoAnalitica izquierda={<a href="/analitica">Volver</a>} />)
    expect(screen.getByText('Volver')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument()
})
