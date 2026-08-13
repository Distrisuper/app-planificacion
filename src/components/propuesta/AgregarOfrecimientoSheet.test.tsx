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

/** SKF aparece dos veces en pantalla cuando "Para" está expandido: una en el
 *  buscador principal (rubro/marca/acción) y otra en el buscador de alcance. El de
 *  alcance se monta después, así que es el último de la lista. */
function tocarSkfEnAlcance() {
    const opciones = screen.getAllByRole('button', { name: /^skf/i })
    fireEvent.click(opciones[opciones.length - 1])
}

describe('AgregarOfrecimientoSheet', () => {
    it('agrega una acción con alcance y detalle sobre una marca', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))
        await userEvent.click(screen.getByRole('button', { name: /^para/i }))
        tocarSkfEnAlcance()
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

    // El alcance solo tiene sentido sobre una acción: acotar un rubro a otro rubro no
    // significa nada.
    it('no ofrece "Para" cuando lo elegido es una marca o un rubro', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /^skf/i }))
        expect(screen.queryByRole('button', { name: /^para/i })).not.toBeInTheDocument()
    })

    it('elegir otra cosa limpia el alcance y el detalle ya cargados', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))
        await userEvent.click(screen.getByRole('button', { name: /^para/i }))
        tocarSkfEnAlcance()
        cargarTramoCupo()

        await userEvent.click(screen.getAllByRole('button', { name: /^skf/i })[0])
        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))
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

        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))

        expect(screen.getByLabelText(/tramo 1.*alcanza/i)).toBeInTheDocument()
    })

    it('con Plan cupo elegido y sin tramos completos, Agregar queda deshabilitado', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()
    })

    it('completar los tramos habilita Agregar', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: /plan cupo/i }))
        cargarTramoCupo()

        expect(screen.getByRole('button', { name: 'Agregar' })).toBeEnabled()
    })

    it('una acción sin módulo de detalle registrado no muestra editor y agrega con solo el DTO base', async () => {
        const onAgregar = vi.fn()
        const otrasAcciones = [{ code: 'PROMO', description: 'Promo verano' }]
        render(
            <AgregarOfrecimientoSheet {...props} acciones={otrasAcciones} onAgregar={onAgregar} />,
        )

        await userEvent.click(screen.getByRole('button', { name: /promo verano/i }))

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
