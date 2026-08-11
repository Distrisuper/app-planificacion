import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorVendedor from './SelectorVendedor'

const VENDEDORES = [
    { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    { codigoParticularVendedor: 'V 5', nombreVendedor: 'Ana Gómez' },
]

describe('SelectorVendedor', () => {
    it('lista los vendedores disponibles', () => {
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={vi.fn()} />,
        )
        expect(screen.getByRole('option', { name: 'Juan Pérez' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Ana Gómez' })).toBeInTheDocument()
    })

    it('avisa el código elegido, no el nombre', async () => {
        const onElegir = vi.fn()
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={onElegir} />,
        )

        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 5')

        expect(onElegir).toHaveBeenCalledWith('V 5')
    })

    it('sin vendedor elegido muestra el placeholder', () => {
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={vi.fn()} />,
        )
        expect(screen.getByLabelText('Vendedor')).toHaveValue('')
    })
})
