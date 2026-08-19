import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import SelectorMes from './SelectorMes'

it('muestra el nombre del mes recibido', () => {
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={vi.fn()} />)
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
})

it('retrocede un mes al hacer click en "Mes anterior"', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2026, 6, 1))
})

it('avanza un mes al hacer click en "Mes siguiente"', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 7, 18)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2026, 8, 1))
})

it('cruza el fin de año correctamente', async () => {
    const onCambiarMes = vi.fn()
    render(<SelectorMes mes={new Date(2026, 11, 5)} onCambiarMes={onCambiarMes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onCambiarMes).toHaveBeenCalledWith(new Date(2027, 0, 1))
})
