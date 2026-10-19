import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlcanceCambioDialog from './AlcanceCambioDialog'

function renderDialog() {
    const onElegir = vi.fn()
    const onCancelar = vi.fn()
    render(
        <AlcanceCambioDialog
            open
            accion="Mover a Kiosco Uno al JUE · Semana 2"
            onElegir={onElegir}
            onCancelar={onCancelar}
        />,
    )
    return { onElegir, onCancelar }
}

describe('AlcanceCambioDialog', () => {
    it('dice qué cambio se está por aplicar', () => {
        renderDialog()
        expect(screen.getByText(/Mover a Kiosco Uno al JUE · Semana 2/)).toBeInTheDocument()
    })

    it('"Solo esta vuelta" elige sin la ruta base', async () => {
        const { onElegir } = renderDialog()
        await userEvent.click(screen.getByRole('button', { name: 'Solo esta vuelta' }))
        expect(onElegir).toHaveBeenCalledWith(false)
    })

    it('"Esta vuelta y la ruta base" elige con la ruta base', async () => {
        const { onElegir } = renderDialog()
        await userEvent.click(screen.getByRole('button', { name: 'Esta vuelta y la ruta base' }))
        expect(onElegir).toHaveBeenCalledWith(true)
    })

    it('Cancelar no elige nada', async () => {
        const { onElegir, onCancelar } = renderDialog()
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
        expect(onCancelar).toHaveBeenCalled()
        expect(onElegir).not.toHaveBeenCalled()
    })

    it('Escape tampoco elige nada', async () => {
        const { onElegir, onCancelar } = renderDialog()
        await userEvent.keyboard('{Escape}')
        expect(onCancelar).toHaveBeenCalled()
        expect(onElegir).not.toHaveBeenCalled()
    })
})
