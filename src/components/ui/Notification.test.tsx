import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Notification } from './Notification'

it('sin notificación no renderiza nada', () => {
    render(<Notification notificacion={null} onDismiss={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('éxito muestra el label "Listo" y el mensaje', () => {
    render(<Notification notificacion={{ tipo: 'exito', mensaje: 'Registrado' }} onDismiss={() => {}} />)
    expect(screen.getByText('Listo')).toBeInTheDocument()
    expect(screen.getByText('Registrado')).toBeInTheDocument()
})

it('error muestra el label "Error"', () => {
    render(
        <Notification
            notificacion={{ tipo: 'error', mensaje: 'No se pudo reagendar.' }}
            onDismiss={() => {}}
        />,
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('No se pudo reagendar.')).toBeInTheDocument()
})

it('info muestra el label "Aviso"', () => {
    render(<Notification notificacion={{ tipo: 'info', mensaje: 'Actualizamos tu agenda.' }} onDismiss={() => {}} />)
    expect(screen.getByText('Aviso')).toBeInTheDocument()
})

it('tocarla la cierra antes de que expire sola', async () => {
    const onDismiss = vi.fn()
    render(<Notification notificacion={{ tipo: 'exito', mensaje: 'Registrado' }} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onDismiss).toHaveBeenCalled()
})
