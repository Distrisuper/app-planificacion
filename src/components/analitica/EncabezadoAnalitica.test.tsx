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
    expect(bloque).toContainElement(screen.getByRole('link', { name: 'Analítica de visitas' }))
    expect(bloque).toContainElement(screen.getByText('barra de filtros'))
    expect(bloque).toContainElement(screen.getByLabelText('Cuenta'))
})

it('pasa enVivo a las tabs', () => {
    montar(<EncabezadoAnalitica enVivo />)
    expect(screen.getByText(/en vivo/i)).toBeInTheDocument()
})

it('con `izquierda` reemplaza las tabs (el detalle del vendedor lleva "Volver")', () => {
    montar(<EncabezadoAnalitica izquierda={<a href="/analitica">Volver</a>} />)
    expect(screen.getByText('Volver')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Actividad' })).not.toBeInTheDocument()
})
