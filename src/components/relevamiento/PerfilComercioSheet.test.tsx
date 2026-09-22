import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PerfilComercioSheet from './PerfilComercioSheet'

const abrir = (props: Partial<React.ComponentProps<typeof PerfilComercioSheet>> = {}) =>
    render(
        <PerfilComercioSheet
            open
            nombreCliente="DERQUI AUTOPARTES"
            onConfirmar={() => {}}
            onClose={() => {}}
            {...props}
        />,
    )

/** Deja el formulario en estado válido mínimo: una especialidad sin detalle, un número
 *  de personas y un tramo de facturación. */
function completarMinimo() {
    fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
    fireEvent.change(screen.getByLabelText(/personas que trabajan/i), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
}

it('no deja iniciar hasta que estén los tres datos, y dice cuál falta', () => {
    abrir()
    // Los tres faltan: el botón no puede prometer "Iniciar visita".
    expect(screen.getByRole('button', { name: /faltan 3 datos/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
    expect(screen.getByRole('button', { name: /faltan 2 datos/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/personas que trabajan/i), { target: { value: '4' } })
    // Con uno solo pendiente se nombra, en vez de decir "falta 1 dato".
    expect(screen.getByRole('button', { name: /falta la facturación/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
})

it('confirma con el perfil cargado: especialidades múltiples y el código del tramo', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar })
    completarMinimo()
    fireEvent.click(screen.getByRole('button', { name: /^agro$/i }))
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidades: ['frenos', 'agro'],
        monomarcaDetalle: undefined,
        personas: 4,
        // El código del negocio viene invertido: 3 es "Mayor a 30M".
        facturacion: 3,
    })
})

it('Monomarca pide la marca, y sin ella no se puede iniciar', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar })
    fireEvent.change(screen.getByLabelText(/personas que trabajan/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('radio', { name: /mayor a 100m/i }))
    fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
    expect(screen.getByRole('button', { name: /falta qué marca/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/de qué marca/i), { target: { value: '  Ford ' } })
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onConfirmar).toHaveBeenCalledWith(
        expect.objectContaining({ especialidades: ['monomarca'], monomarcaDetalle: 'Ford' }),
    )
})

it('destildar Monomarca se lleva la marca cargada', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar })
    completarMinimo()
    fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
    fireEvent.change(screen.getByLabelText(/de qué marca/i), { target: { value: 'Ford' } })
    fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
    // El campo desaparece; volver a tildarla no puede reaparecer con "Ford" ya puesto.
    expect(screen.queryByLabelText(/de qué marca/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
    expect(screen.getByLabelText(/de qué marca/i)).toHaveValue('')
})

it('el stepper resuelve el caso típico sin teclado, y arranca en 1 desde vacío', () => {
    abrir()
    const menos = screen.getByRole('button', { name: /restar una persona/i })
    const mas = screen.getByRole('button', { name: /sumar una persona/i })
    const personas = screen.getByLabelText(/personas que trabajan/i)
    // Vacío: no hay de dónde restar.
    expect(menos).toBeDisabled()
    fireEvent.click(mas)
    // Nadie tiene 0 personas trabajando: el primer "+" vale 1, no 0.
    expect(personas).toHaveValue('1')
    expect(menos).toBeDisabled()
    fireEvent.click(mas)
    fireEvent.click(mas)
    expect(personas).toHaveValue('3')
    fireEvent.click(menos)
    expect(personas).toHaveValue('2')
})

it('el stepper no pasa del máximo, y sigue sobre un valor tipeado a mano', () => {
    abrir()
    const personas = screen.getByLabelText(/personas que trabajan/i)
    // El que tiene 40 empleados los tipea en vez de tocar "+" cuarenta veces.
    fireEvent.change(personas, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /sumar una persona/i }))
    expect(personas).toHaveValue('41')
    fireEvent.change(personas, { target: { value: '999' } })
    expect(screen.getByRole('button', { name: /sumar una persona/i })).toBeDisabled()
})

it('el campo de personas sólo acepta dígitos, y cero no alcanza', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
    fireEvent.click(screen.getByRole('radio', { name: /menor a 10m/i }))
    const personas = screen.getByLabelText(/personas que trabajan/i)
    fireEvent.change(personas, { target: { value: '3a' } })
    expect(personas).toHaveValue('3')
    // 0 personas no es un comercio: se sigue pidiendo el dato.
    fireEvent.change(personas, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: /falta cuántas personas/i })).toBeDisabled()
})
