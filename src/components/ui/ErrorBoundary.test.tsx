import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from './ErrorBoundary'

function Rompe(): never {
    throw new Error('boom')
}

describe('ErrorBoundary', () => {
    afterEach(() => vi.restoreAllMocks())

    it('renderiza los hijos cuando no hay error', () => {
        render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>)
        expect(screen.getByText('todo bien')).toBeInTheDocument()
    })

    it('ante un error de render muestra un aviso con salida en vez de pantalla en blanco', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const recargar = vi.fn()
        render(<ErrorBoundary onRecargar={recargar}><Rompe /></ErrorBoundary>)
        expect(screen.getByText('Algo falló')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Recargar' }))
        expect(recargar).toHaveBeenCalled()
    })
})
