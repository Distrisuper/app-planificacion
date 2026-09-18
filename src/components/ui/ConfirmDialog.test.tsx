import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

    it('con onConfirm async, cierra recién cuando la promesa resuelve', async () => {
        const onOpenChange = vi.fn()
        let resolver!: () => void
        const onConfirm = vi.fn(() => new Promise<void>(r => { resolver = r }))
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />)

        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))
        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onOpenChange).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled()

        resolver()
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('con onConfirm async que rechaza, queda abierto y vuelve a habilitar la acción', async () => {
        const onOpenChange = vi.fn()
        const onConfirm = vi.fn(() => Promise.reject(new Error('falló')))
        render(<ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />)

        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar' })).toBeEnabled())
        expect(onOpenChange).not.toHaveBeenCalled()
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
})
