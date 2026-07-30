import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FiltrosAnalitica from './FiltrosAnalitica'

const FILTRO = { desde: '2026-07-20', hasta: '2026-07-24', vendedores: [] }
const DISPONIBLES = [
    { codigo: 'V1', nombre: 'ACOSTA MARIANO' },
    { codigo: 'V4', nombre: 'DOMINGUEZ SILVINA' },
]

it('muestra el rango activo en los inputs de fecha', () => {
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-07-20')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-07-24')
})

it('el atajo "Este mes" propone el mes en curso completo', async () => {
    const onRango = vi.fn()
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={onRango}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Este mes' }))
    expect(onRango).toHaveBeenCalledTimes(1)
    const [desde, hasta] = onRango.mock.calls[0]
    expect(desde.slice(8)).toBe('01')
    expect(desde <= hasta).toBe(true)
})

it('elegir un vendedor avisa al padre', async () => {
    const onToggleVendedor = vi.fn()
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={onToggleVendedor}
            onLimpiar={vi.fn()}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: /vendedores/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'ACOSTA MARIANO' }))
    expect(onToggleVendedor).toHaveBeenCalledWith('V1')
})

it('sin vendedores elegidos el botón dice "Todos"', () => {
    render(
        <FiltrosAnalitica
            filtro={FILTRO}
            vendedoresDisponibles={DISPONIBLES}
            onRango={vi.fn()}
            onToggleVendedor={vi.fn()}
            onLimpiar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /todos/i })).toBeInTheDocument()
})
