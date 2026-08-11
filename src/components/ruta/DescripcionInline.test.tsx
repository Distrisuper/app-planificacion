import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DescripcionInline from './DescripcionInline'

function renderInline(overrides = {}) {
    const props = {
        valor: null as string | null,
        placeholder: 'Sin nombre',
        etiquetaAccesible: 'Nombrar semana 2',
        onGuardar: vi.fn(),
        ...overrides,
    }
    render(<DescripcionInline {...props} />)
    return props
}

describe('DescripcionInline', () => {
    it('muestra el placeholder cuando no hay nombre', () => {
        renderInline()
        expect(screen.getByText('Sin nombre')).toBeInTheDocument()
    })

    it('muestra el nombre actual cuando lo hay', () => {
        renderInline({ valor: 'Buenos Aires' })
        expect(screen.getByText('Buenos Aires')).toBeInTheDocument()
    })

    it('al tocar el lápiz abre un input con el valor actual', async () => {
        renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))

        expect(screen.getByRole('textbox')).toHaveValue('Buenos Aires')
    })

    it('Enter guarda el valor recortado', async () => {
        const props = renderInline()

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.type(screen.getByRole('textbox'), '  Zona Sur  {Enter}')

        expect(props.onGuardar).toHaveBeenCalledWith('Zona Sur')
    })

    it('guardar vacío manda null para borrar el nombre', async () => {
        const props = renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.clear(screen.getByRole('textbox'))
        await userEvent.keyboard('{Enter}')

        expect(props.onGuardar).toHaveBeenCalledWith(null)
    })

    it('Escape cierra sin guardar', async () => {
        const props = renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.type(screen.getByRole('textbox'), ' cambiado{Escape}')

        expect(props.onGuardar).not.toHaveBeenCalled()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
})
