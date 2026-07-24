import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import SinPermisosPage from './SinPermisosPage'

const useAuthMock = vi.fn()
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => useAuthMock(),
}))

it('shows the role message and calls logout on retry', async () => {
    const logout = vi.fn()
    useAuthMock.mockReturnValue({ logout })
    render(<SinPermisosPage />)
    expect(screen.getByText(/no tiene permisos de vendedor/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /volver a intentar/i }))
    expect(logout).toHaveBeenCalledTimes(1)
})
