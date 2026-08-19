import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ResolucionSheet from './ResolucionSheet'
import type { ComponentProps } from 'react'

const motivos = [
    { motivoId: 1, nivel: 'visita' as const, descripcion: 'Saqué pedido', resultado: 'ganado' as const, codigo: null },
    { motivoId: 4, nivel: 'visita' as const, descripcion: 'Precio', resultado: 'perdido' as const, codigo: null },
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

it('el botón de confirmar vive fuera del scroll, para no perderse con muchos motivos', () => {
    render(<ResolucionSheet open motivos={motivos} confirmLabel="Cerrar visita" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cerrar visita/i }).closest('.overflow-y-auto')).toBeNull()
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
