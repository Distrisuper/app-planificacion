import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import CarteraDialog from './CarteraDialog'

const mutateAsync = vi.fn()
vi.mock('@/hooks/usePrueba', () => ({ useReiniciarPrueba: () => ({ mutateAsync, isPending: false }) }))
vi.mock('@/hooks/useAnalitica', () => ({
    useVendedores: () => ({ data: [{ codigoParticularVendedor: 'V 2', nombreVendedor: 'ROSSI MARTÍN' }] }),
}))
const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))

const GERENCIA = {
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
    vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2', 'NACHO'] },
}
const TESTER = {
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: false },
    vendedorDePrueba: { codigo: 'PRUEBA-9', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2', 'NACHO'] },
}

beforeEach(() => { vi.clearAllMocks(); mutateAsync.mockResolvedValue({}) })

it('lista los orígenes con nombre del roster cuando supervisa, más "Arrancar vacío"', async () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByText('¿Con qué cartera querés arrancar?')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ROSSI MARTÍN (V 2)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'NACHO' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Arrancar vacío' })).toBeInTheDocument()
})

it('un tester ve los códigos pelados (no tiene roster)', () => {
    auth.mockReturnValue(TESTER)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByRole('option', { name: 'V 2' })).toBeInTheDocument()
})

it('elegir un origen y confirmar llama a reiniciar con ese código y avisa', async () => {
    auth.mockReturnValue(GERENCIA)
    const onReiniciado = vi.fn()
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={onReiniciado} />)
    await userEvent.selectOptions(screen.getByLabelText('Cartera'), 'NACHO')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(mutateAsync).toHaveBeenCalledWith('NACHO')
    await waitFor(() => expect(onReiniciado).toHaveBeenCalledTimes(1))
})

it('si reiniciar falla, el diálogo queda abierto con el error y no avisa', async () => {
    // Sin esto la promesa rechazada quedaba sin catch: Radix ya había cerrado el diálogo al
    // tocar la acción, y el usuario veía la agenda vieja sin ninguna explicación.
    auth.mockReturnValue(GERENCIA)
    mutateAsync.mockRejectedValue(new Error('red caída'))
    const onReiniciado = vi.fn()
    const onOpenChange = vi.fn()
    render(<CarteraDialog open onOpenChange={onOpenChange} onReiniciado={onReiniciado} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(await screen.findByText('No pudimos reiniciar la prueba. Probá de nuevo.')).toBeInTheDocument()
    expect(onReiniciado).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

it('ORIGEN_INVALIDO explica que esa cartera ya no está disponible', async () => {
    auth.mockReturnValue(GERENCIA)
    mutateAsync.mockRejectedValue({ response: { data: { code: 'ORIGEN_INVALIDO' } } })
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(await screen.findByText(/Esa cartera ya no está disponible/)).toBeInTheDocument()
})

it('"Arrancar vacío" manda null', async () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Cartera'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(mutateAsync).toHaveBeenCalledWith(null)
})

it('si el origen elegido desaparece de origenesDisponibles, manda el que se ve (el primero)', async () => {
    auth.mockReturnValue(GERENCIA)
    const { rerender } = render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Cartera'), 'NACHO')
    auth.mockReturnValue({
        ...GERENCIA,
        vendedorDePrueba: { ...GERENCIA.vendedorDePrueba, origenesDisponibles: ['V 2', 'PEPE'] },
    })
    rerender(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByLabelText('Cartera')).toHaveValue('V 2')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(mutateAsync).toHaveBeenCalledWith('V 2')
})

it('muestra la advertencia de borrado', () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByText(/Se borran todas tus visitas de prueba/)).toBeInTheDocument()
})
