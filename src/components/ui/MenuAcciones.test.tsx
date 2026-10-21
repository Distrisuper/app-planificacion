import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MenuAcciones from './MenuAcciones'

function montar(onUno = vi.fn()) {
    render(
        <MenuAcciones
            etiqueta="Más acciones: semana 2"
            acciones={[
                { etiqueta: 'Uno', onElegir: onUno },
                { etiqueta: 'Dos', onElegir: vi.fn(), grupo: 'Otras' },
            ]}
        />,
    )
}

describe('MenuAcciones', () => {
    it('arranca cerrado y se abre con el botón', async () => {
        montar()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Más acciones: semana 2' }))

        expect(screen.getByRole('menu')).toBeInTheDocument()
        expect(screen.getByText('Otras')).toBeInTheDocument()
    })

    it('elegir una acción la ejecuta y cierra el menú', async () => {
        const onUno = vi.fn()
        montar(onUno)

        await userEvent.click(screen.getByRole('button', { name: 'Más acciones: semana 2' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Uno' }))

        expect(onUno).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('Escape lo cierra sin ejecutar nada', async () => {
        const onUno = vi.fn()
        montar(onUno)

        await userEvent.click(screen.getByRole('button', { name: 'Más acciones: semana 2' }))
        await userEvent.keyboard('{Escape}')

        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        expect(onUno).not.toHaveBeenCalled()
    })
})
