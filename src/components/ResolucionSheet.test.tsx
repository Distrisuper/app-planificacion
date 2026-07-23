import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ResolucionSheet from './ResolucionSheet'
import type { ComponentProps } from 'react'

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

it('clears the selection after the sheet closes, so it does not bleed into the next open session', async () => {
    const props: Omit<ComponentProps<typeof ResolucionSheet>, 'open'> = {
        motivos,
        confirmLabel: 'Cerrar visita',
        onConfirm: vi.fn(),
        onClose: vi.fn(),
    }
    const { rerender } = render(<ResolucionSheet {...props} open />)
    await userEvent.click(screen.getByText('Precio'))
    expect(screen.getByRole('button', { name: /cerrar visita/i })).not.toBeDisabled()

    rerender(<ResolucionSheet {...props} open={false} />)
    rerender(<ResolucionSheet {...props} open />)

    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})
