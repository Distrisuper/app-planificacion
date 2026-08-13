import { render, screen, fireEvent } from '@testing-library/react'
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

function cargarTramoCupo() {
    fireEvent.change(screen.getByLabelText(/tramo 1.*alcanza/i), { target: { value: '2500000' } })
    fireEvent.change(screen.getByLabelText(/tramo 1.*descuento/i), { target: { value: '3' } })
}

describe('AgregarOfrecimientoSheet', () => {
    it('arranca en Rubro', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('agrega una acción con alcance y detalle sobre una marca', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /^para/i }))
        await userEvent.click(screen.getByRole('button', { name: /skf.*marca/i }))
        cargarTramoCupo()
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
            detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
        })
    })

    it('agrega una marca sin alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

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

        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()
    })

    it('cambiar de tipo limpia lo elegido, el alcance y el detalle', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /^para/i }))
        await userEvent.click(screen.getByRole('button', { name: /skf.*marca/i }))
        cargarTramoCupo()

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        // Sin volver a cargar tramos: si quedaran los anteriores, "Agregar" ya estaría habilitado.
        expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()

        cargarTramoCupo()
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [],
            detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
        })
    })

    it('no deja agregar sin elegir nada', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()
    })

    it('elegir una acción con módulo de detalle (Plan cupo) muestra el editor de tramos', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(screen.getByLabelText(/tramo 1.*alcanza/i)).toBeInTheDocument()
    })

    it('con Plan cupo elegido y sin tramos completos, Agregar queda deshabilitado', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()
    })

    it('completar los tramos habilita Agregar', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        cargarTramoCupo()

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeEnabled()
    })

    it('una acción sin módulo de detalle registrado no muestra editor y agrega con solo el DTO base', async () => {
        const onAgregar = vi.fn()
        const otrasAcciones = [{ code: 'PROMO', description: 'Promo verano' }]
        render(
            <AgregarOfrecimientoSheet {...props} acciones={otrasAcciones} onAgregar={onAgregar} />,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Promo verano' }))

        expect(screen.queryByLabelText(/tramo 1/i)).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'PROMO',
            descripcion: 'Promo verano',
            alcance: [],
        })
    })
})
