import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import EstadoVisitaSheet from './EstadoVisitaSheet'

const noop = () => {}

it('cerrado no renderiza nada', () => {
    render(
        <EstadoVisitaSheet
            open={false}
            nombreCliente="Almacén Don José"
            diaActual="LUN"
            estadoActual="pendiente"
            onElegirDia={noop}
            onElegirNoVisita={noop}
            onClose={noop}
        />,
    )
    expect(screen.queryByText('Almacén Don José')).not.toBeInTheDocument()
})

it('el botón de confirmar arranca deshabilitado hasta elegir una opción', () => {
    render(
        <EstadoVisitaSheet
            open
            nombreCliente="Almacén Don José"
            diaActual="LUN"
            estadoActual="pendiente"
            onElegirDia={noop}
            onElegirNoVisita={noop}
            onClose={noop}
        />,
    )
    const confirmar = screen.getByRole('button', { name: /elegí una opción/i })
    expect(confirmar).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /martes/i }))
    expect(confirmar).toBeEnabled()
})

it('elegir un día y confirmar dispara onElegirDia con ese día', () => {
    const onElegirDia = vi.fn()
    render(
        <EstadoVisitaSheet
            open
            nombreCliente="Almacén Don José"
            diaActual="LUN"
            estadoActual="pendiente"
            onElegirDia={onElegirDia}
            onElegirNoVisita={noop}
            onClose={noop}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /jueves/i }))
    fireEvent.click(screen.getByRole('button', { name: /elegí una opción/i }))
    expect(onElegirDia).toHaveBeenCalledWith('JUE')
})

it('elegir "No visité" y confirmar dispara onElegirNoVisita', () => {
    const onElegirNoVisita = vi.fn()
    render(
        <EstadoVisitaSheet
            open
            nombreCliente="Almacén Don José"
            diaActual="LUN"
            estadoActual="pendiente"
            onElegirDia={noop}
            onElegirNoVisita={onElegirNoVisita}
            onClose={noop}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^no visité$/i }))
    fireEvent.click(screen.getByRole('button', { name: /elegí una opción/i }))
    expect(onElegirNoVisita).toHaveBeenCalled()
})

it('si el cliente ya está en no_visita, la opción se muestra deshabilitada y marcada', () => {
    render(
        <EstadoVisitaSheet
            open
            nombreCliente="Almacén Don José"
            diaActual="LUN"
            estadoActual="no_visita"
            onElegirDia={noop}
            onElegirNoVisita={noop}
            onClose={noop}
        />,
    )
    expect(screen.getByText(/ya registrado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no visité.*ya registrado/i })).toBeDisabled()
})
