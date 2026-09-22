import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PerfilComercioSheet from './PerfilComercioSheet'
import { useCamposFicha } from '@/hooks/useCamposFicha'
import type { IFichaCampoDef } from '@/types/planificacion'

vi.mock('@/hooks/useCamposFicha', () => ({ useCamposFicha: vi.fn() }))

const base = { minimo: null, maximo: null, obligatorio: true, multiple: false, opciones: null }

/** El catálogo tal cual lo manda GET /planificacion/ficha/campos. Los tests de este archivo
 *  dibujan CONTRA ESTO: si mañana se agrega una opción en la base, el front no cambia. */
const CATALOGO: IFichaCampoDef[] = [
    {
        ...base, campo: 'especialidad', descripcion: 'Especialidad', tipo: 'opcion',
        multiple: true, orden: 1,
        opciones: [
            { codigo: 'frenos', label: 'Frenos' },
            { codigo: 'agro', label: 'Agro' },
            { codigo: 'monomarca', label: 'Monomarca' },
        ],
    },
    {
        ...base, campo: 'monomarca_marca', descripcion: '¿De qué marca?', tipo: 'opcion',
        obligatorio: false, orden: 2, minimo: 1, maximo: 60,
        opciones: [
            { codigo: 'ford', label: 'Ford' },
            { codigo: 'fiat', label: 'Fiat' },
            { codigo: 'otros', label: 'Otros', abierta: true },
        ],
    },
    {
        ...base, campo: 'personas', descripcion: 'Personas que trabajan', tipo: 'entero',
        orden: 3, minimo: 1, maximo: 999,
    },
    {
        ...base, campo: 'facturacion', descripcion: 'Facturación mensual', tipo: 'opcion',
        orden: 4,
        opciones: [
            { codigo: '5', label: 'Menor a 10M', labelCorto: '<10M' },
            { codigo: '3', label: 'Mayor a 30M', labelCorto: '+30M' },
            { codigo: '1', label: 'Mayor a 100M', labelCorto: '+100M' },
        ],
    },
]

const conCatalogo = (over: Partial<ReturnType<typeof useCamposFicha>> = {}) =>
    (useCamposFicha as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        data: CATALOGO, isError: false, refetch: vi.fn(), ...over,
    })

beforeEach(() => conCatalogo())

const abrir = (props: Partial<React.ComponentProps<typeof PerfilComercioSheet>> = {}) =>
    render(
        <PerfilComercioSheet
            open
            nombreCliente="DERQUI AUTOPARTES"
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
    fireEvent.change(screen.getByRole('textbox', { name: /personas que trabajan/i }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
}

it('no deja iniciar hasta que estén los tres datos, y dice cuál falta', () => {
    abrir()
    expect(screen.getByRole('button', { name: /faltan 3 datos/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
    expect(screen.getByRole('button', { name: /faltan 2 datos/i })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: /personas que trabajan/i }), { target: { value: '4' } })
    // Con uno solo pendiente se nombra, con el título que da el CATÁLOGO.
    expect(screen.getByRole('button', { name: /falta: facturación mensual/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
})

it('los controles salen del catálogo: chips para multiple, segmented para una sola', () => {
    abrir()
    // Especialidad: una opción por cada una del catálogo, ni una más.
    expect(screen.getByRole('button', { name: /^frenos$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^agro$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^gomería$/i })).not.toBeInTheDocument()
    // Facturación: segmented (radios) con el labelCorto a la vista y el label completo
    // como nombre accesible.
    const tramo = screen.getByRole('radio', { name: 'Mayor a 30M' })
    expect(tramo).toHaveTextContent('+30M')
})

it('confirma con el perfil cargado: especialidades múltiples y el código del tramo', () => {
    const onConfirmar = vi.fn()
    abrir({ onConfirmar })
    completarMinimo()
    fireEvent.click(screen.getByRole('button', { name: /^agro$/i }))
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidad: ['frenos', 'agro'], personas: ['4'], facturacion: ['3'],
    })
})

describe('Monomarca', () => {
    it('pide la marca como lista, y sin ella no se puede iniciar', () => {
        const onConfirmar = vi.fn()
        abrir({ onConfirmar })
        fireEvent.change(screen.getByRole('textbox', { name: /personas que trabajan/i }), { target: { value: '2' } })
        fireEvent.click(screen.getByRole('radio', { name: 'Mayor a 100M' }))
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        expect(screen.getByRole('button', { name: /falta: ¿de qué marca\?/i })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: /^ford$/i }))
        fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
        expect(onConfirmar).toHaveBeenCalledWith(
            expect.objectContaining({ especialidad: ['monomarca'], monomarca_marca: ['ford'] }),
        )
    })

    it('"Otros" abre un texto libre y guarda LO ESCRITO, no el código de la opción', () => {
        const onConfirmar = vi.fn()
        abrir({ onConfirmar })
        completarMinimo()
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        // Sin tocar "Otros" no hay input: es una opción más de la lista.
        expect(screen.queryByRole('textbox', { name: /otra/i })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /^otros$/i }))
        const libre = screen.getByRole('textbox', { name: /¿de qué marca\? — otra/i })
        // Elegido pero vacío todavía no alcanza.
        expect(screen.getByRole('button', { name: /falta: ¿de qué marca\?/i })).toBeDisabled()
        fireEvent.change(libre, { target: { value: '  Chery ' } })
        fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
        expect(onConfirmar).toHaveBeenCalledWith(
            expect.objectContaining({ monomarca_marca: ['Chery'] }),
        )
    })

    it('elegir una marca de la lista cierra el texto libre', () => {
        abrir()
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        fireEvent.click(screen.getByRole('button', { name: /^otros$/i }))
        expect(screen.getByRole('textbox', { name: /¿de qué marca\? — otra/i })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /^fiat$/i }))
        expect(screen.queryByRole('textbox', { name: /¿de qué marca\? — otra/i })).toBeNull()
    })

    it('destildar Monomarca se lleva la marca cargada, incluido el texto libre', () => {
        abrir()
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        fireEvent.click(screen.getByRole('button', { name: /^otros$/i }))
        fireEvent.change(screen.getByRole('textbox', { name: /¿de qué marca\? — otra/i }), { target: { value: 'Chery' } })
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        // El bloque desaparece; volver a tildarla no puede reaparecer con "Chery" puesto.
        expect(screen.queryByRole('button', { name: /^ford$/i })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /^monomarca$/i }))
        expect(screen.queryByRole('textbox', { name: /¿de qué marca\? — otra/i })).toBeNull()
        expect(screen.getByRole('button', { name: /^ford$/i })).toHaveAttribute('aria-pressed', 'false')
    })
})

it('el stepper resuelve el caso típico sin teclado, y arranca en 1 desde vacío', () => {
    abrir()
    const menos = screen.getByRole('button', { name: /restar en personas que trabajan/i })
    const mas = screen.getByRole('button', { name: /sumar en personas que trabajan/i })
    const personas = screen.getByRole('textbox', { name: /personas que trabajan/i })
    expect(menos).toBeDisabled()
    fireEvent.click(mas)
    // Nadie tiene 0 personas trabajando: el primer "+" vale 1, no 0. El mínimo sale del
    // catálogo, no de una constante del front.
    expect(personas).toHaveValue('1')
    expect(menos).toBeDisabled()
    fireEvent.click(mas)
    fireEvent.click(mas)
    expect(personas).toHaveValue('3')
    fireEvent.click(menos)
    expect(personas).toHaveValue('2')
})

it('el stepper no pasa del máximo del catálogo, y sigue sobre un valor tipeado a mano', () => {
    abrir()
    const personas = screen.getByRole('textbox', { name: /personas que trabajan/i })
    fireEvent.change(personas, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /sumar en personas que trabajan/i }))
    expect(personas).toHaveValue('41')
    fireEvent.change(personas, { target: { value: '999' } })
    expect(screen.getByRole('button', { name: /sumar en personas que trabajan/i })).toBeDisabled()
})

it('el campo entero sólo acepta dígitos, y cero no alcanza', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /^frenos$/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Menor a 10M' }))
    const personas = screen.getByRole('textbox', { name: /personas que trabajan/i })
    fireEvent.change(personas, { target: { value: '3a' } })
    expect(personas).toHaveValue('3')
    fireEvent.change(personas, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: /falta: personas que trabajan/i })).toBeDisabled()
})

it('con un solo campo pendiente dibuja sólo ese, y el botón nombra sólo ese faltante', () => {
    abrir({ campos: ['facturacion'] })
    expect(screen.queryByRole('button', { name: /^frenos$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /personas que trabajan/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /falta: facturación mensual/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Menor a 10M' }))
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
})

it('en modo edición precarga los valores, el botón dice Guardar y no muestra el texto de "una sola vez"', () => {
    const onConfirmar = vi.fn()
    abrir({
        modo: 'edicion',
        onConfirmar,
        valoresIniciales: { especialidad: ['frenos', 'monomarca'], monomarca_marca: ['ford'], personas: ['4'], facturacion: ['3'] },
    })
    expect(screen.queryByText(/se carga una sola vez/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^frenos$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^ford$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: /personas que trabajan/i })).toHaveValue('4')
    expect(screen.getByRole('radio', { name: 'Mayor a 30M' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(onConfirmar).toHaveBeenCalledWith({
        especialidad: ['frenos', 'monomarca'], monomarca_marca: ['ford'], personas: ['4'], facturacion: ['3'],
    })
})

it('en edición, una marca vieja fuera de la lista se precarga como "Otros" con su texto', () => {
    // Es el caso del dato cargado cuando el campo era texto libre, o por un catálogo que
    // después cambió: el único origen posible de un valor que no matchea ningún código.
    abrir({
        modo: 'edicion',
        valoresIniciales: { especialidad: ['monomarca'], monomarca_marca: ['Chery'], personas: ['4'], facturacion: ['3'] },
    })
    expect(screen.getByRole('button', { name: /^otros$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: /¿de qué marca\? — otra/i })).toHaveValue('Chery')
})

describe('mientras el catálogo no llegó', () => {
    it('no ofrece el botón: sin campos dibujados, "no falta nada" y mandaría un PUT vacío', () => {
        conCatalogo({ data: undefined })
        abrir()
        expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /faltan/i })).not.toBeInTheDocument()
    })

    it('si el GET falla, ofrece reintentar en vez de dejar un spinner eterno', () => {
        const refetch = vi.fn()
        conCatalogo({ data: undefined, isError: true, refetch })
        abrir()
        expect(screen.getByText(/no pudimos traer los datos/i)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /volver a intentar/i }))
        expect(refetch).toHaveBeenCalled()
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
