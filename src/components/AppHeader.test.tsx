import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AppHeader from './AppHeader'

it('shows the visit progress out of the total', () => {
    render(<AppHeader vendedorNombre="Martín Rossi" completadas={3} total={40} rangoSemana="13 – 17 Jul" />)
    expect(screen.getByText('3 / 40')).toBeInTheDocument()
})

it('does not show an account menu when onLogout is not passed', () => {
    render(<AppHeader vendedorNombre="Martín Rossi" completadas={3} total={40} rangoSemana="13 – 17 Jul" />)
    expect(screen.queryByLabelText('Cuenta')).not.toBeInTheDocument()
})

it('opens the account menu from the avatar and triggers logout from it', async () => {
    const onLogout = vi.fn()
    render(
        <AppHeader
            vendedorNombre="Martín Rossi"
            completadas={3}
            total={40}
            rangoSemana="13 – 17 Jul"
            onLogout={onLogout}
        />,
    )
    expect(screen.queryByRole('menuitem', { name: /cerrar sesión/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Cuenta'))
    expect(screen.getByText('Martín Rossi')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }))
    expect(onLogout).toHaveBeenCalledTimes(1)
})
