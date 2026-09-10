import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from './ConfirmDialog'

const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: '¿Quitar a Casa Fenco de esta vuelta?',
    description: 'Vuelve a aparecer en la próxima rotación.',
    confirmLabel: 'Quitar',
    onConfirm: vi.fn(),
}

describe('ConfirmDialog', () => {
    it('no renderiza nada cerrado', () => {
        render(<ConfirmDialog {...props} open={false} />)
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('anuncia título y descripción dentro de un alertdialog', () => {
        render(<ConfirmDialog {...props} />)
        const dialogo = screen.getByRole('alertdialog')
        expect(dialogo).toHaveAccessibleName(props.title)
        expect(dialogo).toHaveAccessibleDescription(props.description)
    })

    it('confirmar dispara onConfirm; cancelar solo cierra', async () => {
        const onConfirm = vi.fn()
        const onOpenChange = vi.fn()
        const { rerender } = render(
            <ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
        expect(onConfirm).not.toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)

        rerender(<ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />)
        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('Escape cierra sin confirmar: la tecla de escape nunca ejecuta la acción', async () => {
        const onConfirm = vi.fn()
        const onOpenChange = vi.fn()
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />)

        await userEvent.keyboard('{Escape}')

        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('el foco arranca en la opción segura, no en la que ejecuta', async () => {
        // Un Enter reflejo con el diálogo recién abierto no puede quitar al cliente.
        render(<ConfirmDialog {...props} />)
        expect(await screen.findByRole('button', { name: 'Cancelar' })).toHaveFocus()
    })
})
