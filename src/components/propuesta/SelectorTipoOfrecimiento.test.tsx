import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SelectorTipoOfrecimiento from './SelectorTipoOfrecimiento'

describe('SelectorTipoOfrecimiento', () => {
    it('muestra los tres tipos con catálogo', () => {
        render(<SelectorTipoOfrecimiento value="rubro" onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Marca' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument()
    })

    // linea y articulo existen en el back pero no tienen catálogo: no se ofrecen.
    it('no ofrece línea ni artículo', () => {
        render(<SelectorTipoOfrecimiento value="rubro" onChange={vi.fn()} />)

        expect(screen.queryByRole('button', { name: 'Línea' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Artículo' })).not.toBeInTheDocument()
    })

    it('marca el tipo activo', () => {
        render(<SelectorTipoOfrecimiento value="marca" onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Marca' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('avisa el cambio de tipo', async () => {
        const onChange = vi.fn()
        render(<SelectorTipoOfrecimiento value="rubro" onChange={onChange} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))

        expect(onChange).toHaveBeenCalledWith('accion')
    })
})
