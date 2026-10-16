import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import Selector from './Selector'

const VENDEDORES = [
    { valor: 'V1', etiqueta: 'Acosta Mariano' },
    { valor: 'V2', etiqueta: 'Benítez Laura' },
    { valor: 'V3', etiqueta: 'Cabrera Diego' },
]

describe('Selector simple', () => {
    it('muestra lo elegido (o el texto de ayuda) y abre la lista al tocarlo', async () => {
        const { rerender } = render(
            <Selector etiqueta="Vendedor" placeholder="Elegí un vendedor" opciones={VENDEDORES} valor={null} onCambiar={vi.fn()} />,
        )
        const boton = screen.getByRole('button', { name: 'Vendedor' })
        expect(boton).toHaveTextContent('Elegí un vendedor')
        expect(boton).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

        rerender(<Selector etiqueta="Vendedor" placeholder="Elegí un vendedor" opciones={VENDEDORES} valor="V2" onCambiar={vi.fn()} />)
        expect(boton).toHaveTextContent('Benítez Laura')
        await userEvent.click(boton)
        expect(screen.getByRole('listbox', { name: 'Vendedor' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Benítez Laura' })).toHaveAttribute('aria-selected', 'true')
    })

    it('elegir una opción avisa su valor y cierra la lista', async () => {
        const onCambiar = vi.fn()
        render(<Selector etiqueta="Vendedor" opciones={VENDEDORES} valor={null} onCambiar={onCambiar} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        await userEvent.click(screen.getByRole('option', { name: 'Cabrera Diego' }))
        expect(onCambiar).toHaveBeenCalledWith('V3')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('busca sin acentos ni mayúsculas', async () => {
        render(<Selector etiqueta="Vendedor" opciones={VENDEDORES} valor={null} onCambiar={vi.fn()} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'benitez')
        expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Benítez Laura'])
    })

    it('Escape cierra la lista sin elegir y devuelve el foco al botón', async () => {
        const onCambiar = vi.fn()
        render(<Selector etiqueta="Vendedor" opciones={VENDEDORES} valor={null} onCambiar={onCambiar} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        expect(onCambiar).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Vendedor' })).toHaveFocus()
    })

    it('con el teclado: Enter elige y el foco vuelve al botón', async () => {
        const onCambiar = vi.fn()
        render(<Selector etiqueta="Vendedor" opciones={VENDEDORES} valor={null} onCambiar={onCambiar} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        screen.getByRole('option', { name: 'Acosta Mariano' }).focus()
        await userEvent.keyboard('{Enter}')
        expect(onCambiar).toHaveBeenCalledWith('V1')
        expect(screen.getByRole('button', { name: 'Vendedor' })).toHaveFocus()
    })

    it('un clic afuera o salir con Tab cierran la lista', async () => {
        render(
            <>
                <Selector etiqueta="Vendedor" opciones={VENDEDORES} valor={null} onCambiar={vi.fn()} />
                <button type="button">Afuera</button>
            </>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        await userEvent.click(screen.getByRole('button', { name: 'Afuera' }))
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Vendedor' }))
        screen.getAllByRole('option').at(-1)!.focus()
        await userEvent.tab()
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
})

describe('Selector múltiple', () => {
    it('sin elegidos dice "Todos"; con uno, su nombre; con más, cuántos', () => {
        const { rerender } = render(
            <Selector multiple etiqueta="Vendedores" opciones={VENDEDORES} valores={[]} onCambiar={vi.fn()} />,
        )
        const boton = screen.getByRole('button', { name: 'Vendedores' })
        expect(boton).toHaveTextContent('Todos')
        rerender(<Selector multiple etiqueta="Vendedores" opciones={VENDEDORES} valores={['V1']} onCambiar={vi.fn()} />)
        expect(boton).toHaveTextContent('Acosta Mariano')
        rerender(<Selector multiple etiqueta="Vendedores" opciones={VENDEDORES} valores={['V1', 'V3']} onCambiar={vi.fn()} />)
        expect(boton).toHaveTextContent('2 elegidos')
    })

    it('tocar una opción la suma o la saca, y la lista queda abierta', async () => {
        const onCambiar = vi.fn()
        render(<Selector multiple etiqueta="Vendedores" opciones={VENDEDORES} valores={['V1']} onCambiar={onCambiar} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedores' }))
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')
        await userEvent.click(screen.getByRole('option', { name: 'Benítez Laura' }))
        expect(onCambiar).toHaveBeenLastCalledWith(['V1', 'V2'])
        await userEvent.click(screen.getByRole('option', { name: 'Acosta Mariano' }))
        expect(onCambiar).toHaveBeenLastCalledWith([])
        expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('"Todos" limpia la selección', async () => {
        const onCambiar = vi.fn()
        render(<Selector multiple etiqueta="Vendedores" opciones={VENDEDORES} valores={['V1', 'V2']} onCambiar={onCambiar} />)
        await userEvent.click(screen.getByRole('button', { name: 'Vendedores' }))
        await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
        expect(onCambiar).toHaveBeenCalledWith([])
    })
})
