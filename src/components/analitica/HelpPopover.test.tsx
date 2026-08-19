import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HelpPopover from './HelpPopover'

function montar() {
    return render(
        <div>
            <HelpPopover label="Qué significa Foo">Contenido de ayuda de Foo</HelpPopover>
            <button type="button">Otro control de la pantalla</button>
        </div>,
    )
}

it('el contenido no está visible hasta que se abre', () => {
    montar()
    expect(screen.queryByText('Contenido de ayuda de Foo')).not.toBeInTheDocument()
})

it('clickear el botón de ayuda muestra el contenido', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Qué significa Foo' }))
    expect(screen.getByText('Contenido de ayuda de Foo')).toBeInTheDocument()
})

it('clickear afuera cierra el panel', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Qué significa Foo' }))
    expect(screen.getByText('Contenido de ayuda de Foo')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Otro control de la pantalla' }))
    expect(screen.queryByText('Contenido de ayuda de Foo')).not.toBeInTheDocument()
})

it('Escape cierra el panel', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Qué significa Foo' }))
    expect(screen.getByText('Contenido de ayuda de Foo')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Contenido de ayuda de Foo')).not.toBeInTheDocument()
})

it('clickear el botón de nuevo lo vuelve a cerrar', async () => {
    montar()
    const boton = screen.getByRole('button', { name: 'Qué significa Foo' })
    await userEvent.click(boton)
    expect(screen.getByText('Contenido de ayuda de Foo')).toBeInTheDocument()

    await userEvent.click(boton)
    expect(screen.queryByText('Contenido de ayuda de Foo')).not.toBeInTheDocument()
})
