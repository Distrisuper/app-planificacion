import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PerfilComercioSheet from './PerfilComercioSheet'
import { CAMPOS_FICHA } from '@/lib/relevamientos'

const abrir = (props: Partial<React.ComponentProps<typeof PerfilComercioSheet>> = {}) =>
    render(
        <PerfilComercioSheet
            open
            nombreCliente="DERQUI AUTOPARTES"
            campos={CAMPOS_FICHA}
            modo="gate"
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
        especialidad: ['frenos', 'agro'],
        personas: ['4'],
        // El código del negocio viene invertido: '3' es "Mayor a 30M". Strings: es lo que
        // guarda pl_ficha_valor y lo que espera el ERP.
        facturacion: ['3'],
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
        expect.objectContaining({ especialidad: ['monomarca'], monomarca_marca: ['Ford'] }),
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

it('con un solo campo pendiente dibuja sólo ese, y el botón nombra sólo ese faltante', () => {
    abrir({ campos: ['facturacion'] })
    expect(screen.queryByText(/especialidad/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/personas que trabajan/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /falta la facturación/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /menor a 10m/i }))
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
})

it('en modo edición precarga los valores, el botón dice Guardar y no muestra el texto de "una sola vez"', () => {
    const onConfirmar = vi.fn()
    abrir({
        modo: 'edicion',
        onConfirmar,
        valoresIniciales: { especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'] },
    })
    expect(screen.queryByText(/se carga una sola vez/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^frenos$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/de qué marca/i)).toHaveValue('Ford')
    expect(screen.getByLabelText(/personas que trabajan/i)).toHaveValue('4')
    expect(screen.getByRole('radio', { name: /mayor a 30m/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidad: ['frenos', 'monomarca'], monomarca_marca: ['Ford'], personas: ['4'], facturacion: ['3'],
    })
})

it('muestra el error del PUT y deja reintentar con el botón habilitado', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar, error: 'No pudimos guardar los datos. Revisá la conexión.' })
    completarMinimo()
    expect(screen.getByText(/no pudimos guardar/i)).toBeInTheDocument()
    const boton = screen.getByRole('button', { name: /iniciar visita/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    expect(onConfirmar).toHaveBeenCalledTimes(1)
})

it('mientras guarda, el botón queda deshabilitado', () => {
    abrir({ guardando: true })
    completarMinimo()
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeDisabled()
})
