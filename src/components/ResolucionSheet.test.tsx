import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ResolucionSheet from './ResolucionSheet'

const motivos = [
    { motivoId: 1, descripcion: 'Saqué pedido' },
    { motivoId: 4, descripcion: 'Precio' },
]

it('toggles motivos and submits the selected ids', async () => {
    const onConfirm = vi.fn()
    render(
        <ResolucionSheet open motivos={motivos} confirmLabel="Cerrar visita" onConfirm={onConfirm} onClose={vi.fn()} />,
    )
    await userEvent.click(screen.getByText('Saqué pedido'))
    await userEvent.click(screen.getByText('Precio'))
    await userEvent.click(screen.getByText('Saqué pedido')) // toggle off
    await userEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))
    expect(onConfirm).toHaveBeenCalledWith([4])
})

it('disables confirm when nothing is selected', () => {
    render(<ResolucionSheet open motivos={motivos} confirmLabel="Cerrar visita" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})
