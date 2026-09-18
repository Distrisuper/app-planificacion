import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AccountMenu from './AccountMenu'

it('pinta las acciones extra antes de "Cerrar sesión" y las ejecuta', async () => {
    const probar = vi.fn()
    render(<AccountMenu nombre="Ana" onLogout={() => {}} acciones={[{ label: 'Probar la app del vendedor', onClick: probar }]} />)
    await userEvent.click(screen.getByLabelText('Cuenta'))
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('Probar la app del vendedor')
    expect(items[1]).toHaveTextContent('Cerrar sesión')
    await userEvent.click(items[0])
    expect(probar).toHaveBeenCalledTimes(1)
})

it('sin acciones, solo "Cerrar sesión" (como siempre)', async () => {
    render(<AccountMenu nombre="Ana" onLogout={() => {}} />)
    await userEvent.click(screen.getByLabelText('Cuenta'))
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
})
