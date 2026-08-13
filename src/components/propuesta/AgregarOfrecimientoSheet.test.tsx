import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AgregarOfrecimientoSheet from './AgregarOfrecimientoSheet'

const marcas = [{ code: 'SKF', description: 'SKF' }]
const rubros = [{ code: 'RODAM', description: 'Rodamientos' }]

const props = {
    open: true,
    onClose: vi.fn(),
    marcas,
    rubros,
}

describe('AgregarOfrecimientoSheet', () => {
    it('agrega una marca sin alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: /^skf/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'marca',
            codigo: 'SKF',
            descripcion: 'SKF',
            alcance: [],
        })
    })

    it('agrega un rubro directo, sin elegir ningún tipo antes', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: /rodamientos/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'rubro',
            codigo: 'RODAM',
            descripcion: 'Rodamientos',
            alcance: [],
        })
    })

    // El alcance solo tiene sentido sobre una acción, y las acciones ya no se agregan
    // como ofrecimiento — no hay ningún tipo elegible que lo necesite.
    it('no ofrece "Para" para ningún tipo', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /^skf/i }))
        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()
    })

    it('elegir el resultado colapsa el buscador principal a un resumen', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: /^skf/i }))

        expect(screen.queryByPlaceholderText(/buscar rubro o marca/i)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^skf/i })).toHaveTextContent('Marca')
    })

    it('no deja agregar sin elegir nada', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()
    })
})
