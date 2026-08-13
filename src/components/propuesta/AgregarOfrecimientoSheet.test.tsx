import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AgregarOfrecimientoSheet from './AgregarOfrecimientoSheet'

const acciones = [{ code: 'CUPO', description: 'Plan cupo' }]
const marcas = [{ code: 'SKF', description: 'SKF' }]
const rubros = [{ code: 'RODAM', description: 'Rodamientos' }]

const props = {
    open: true,
    onClose: vi.fn(),
    acciones,
    marcas,
    rubros,
}

describe('AgregarOfrecimientoSheet', () => {
    it('arranca en Rubro', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('agrega una acción con alcance sobre una marca', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })
    })

    it('agrega una marca sin alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'marca',
            codigo: 'SKF',
            descripcion: 'SKF',
            alcance: [],
        })
    })

    // El alcance solo tiene sentido sobre una acción: acotar un rubro a otro rubro no
    // significa nada.
    it('no ofrece acotar cuando el tipo es marca o rubro', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /acotar/i })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        expect(screen.queryByRole('button', { name: /acotar/i })).not.toBeInTheDocument()
    })

    it('cambiar de tipo limpia lo elegido y el alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [],
        })
    })

    it('no deja agregar sin elegir nada', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled()
    })
})
