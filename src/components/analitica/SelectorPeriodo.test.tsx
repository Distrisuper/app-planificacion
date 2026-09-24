import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import SelectorPeriodo from './SelectorPeriodo'

it('en modo mes muestra el nombre del mes recibido', () => {
    render(
        <SelectorPeriodo
            modo="mes"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={vi.fn()}
            onCambiarFecha={vi.fn()}
        />,
    )
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
})

it('en modo semana muestra el rango lunes a viernes', () => {
    render(
        <SelectorPeriodo
            modo="semana"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={vi.fn()}
            onCambiarFecha={vi.fn()}
        />,
    )
    expect(screen.getByText('17/08 al 21/08')).toBeInTheDocument()
})

it('retrocede un mes al hacer click en "Mes anterior"', async () => {
    const onCambiarFecha = vi.fn()
    render(
        <SelectorPeriodo
            modo="mes"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={vi.fn()}
            onCambiarFecha={onCambiarFecha}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(onCambiarFecha).toHaveBeenCalledWith(new Date(2026, 6, 1))
})

it('avanza un mes al hacer click en "Mes siguiente", cruzando fin de año', async () => {
    const onCambiarFecha = vi.fn()
    render(
        <SelectorPeriodo
            modo="mes"
            fecha={new Date(2026, 11, 5)}
            onCambiarModo={vi.fn()}
            onCambiarFecha={onCambiarFecha}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onCambiarFecha).toHaveBeenCalledWith(new Date(2027, 0, 1))
})

it('en modo semana, "Semana siguiente" avanza 7 días', async () => {
    const onCambiarFecha = vi.fn()
    render(
        <SelectorPeriodo
            modo="semana"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={vi.fn()}
            onCambiarFecha={onCambiarFecha}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }))
    expect(onCambiarFecha).toHaveBeenCalledWith(new Date(2026, 7, 25))
})

it('cambiar de modo notifica el modo y resetea la fecha a hoy', async () => {
    const onCambiarModo = vi.fn()
    const onCambiarFecha = vi.fn()
    render(
        <SelectorPeriodo
            modo="mes"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={onCambiarModo}
            onCambiarFecha={onCambiarFecha}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(onCambiarModo).toHaveBeenCalledWith('semana')
    expect(onCambiarFecha).toHaveBeenCalledTimes(1)
})

it('clickear el modo ya activo no dispara cambios', async () => {
    const onCambiarModo = vi.fn()
    const onCambiarFecha = vi.fn()
    render(
        <SelectorPeriodo
            modo="mes"
            fecha={new Date(2026, 7, 18)}
            onCambiarModo={onCambiarModo}
            onCambiarFecha={onCambiarFecha}
        />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mes' }))
    expect(onCambiarModo).not.toHaveBeenCalled()
    expect(onCambiarFecha).not.toHaveBeenCalled()
})

it('sin conRango no muestra el botón de rango', () => {
    render(<SelectorPeriodo modo="mes" fecha={new Date(2026, 7, 18)} onCambiarModo={vi.fn()} onCambiarFecha={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Rango de fechas' })).not.toBeInTheDocument()
})

it('en modo rango muestra dos fechas y notifica el cambio', async () => {
    const onCambiarRango = vi.fn()
    render(
        <SelectorPeriodo
            modo="rango" fecha={new Date(2026, 8, 18)} conRango
            rango={{ desde: '2026-09-01', hasta: '2026-09-18' }}
            onCambiarModo={vi.fn()} onCambiarFecha={vi.fn()} onCambiarRango={onCambiarRango}
        />,
    )
    // fireEvent y no userEvent.type: en jsdom tipear un input[type=date] carácter por
    // carácter es poco confiable; lo que importa es qué se notifica con un valor completo.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-05' } })
    expect(onCambiarRango).toHaveBeenLastCalledWith({ desde: '2026-09-05', hasta: '2026-09-18' })
})
