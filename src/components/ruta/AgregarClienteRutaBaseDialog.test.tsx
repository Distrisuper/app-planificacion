import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import AgregarClienteRutaBaseDialog from './AgregarClienteRutaBaseDialog'

vi.mock('@/api/planificacionAdmin')

function renderDialog(onClose = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <AgregarClienteRutaBaseDialog
                open
                onClose={onClose}
                codigoVendedor="V 2"
                semana={2}
                dia={3}
                zonas={[
                    { semana: 1, descripcion: 'Norte' },
                    { semana: 2, descripcion: 'Zárate' },
                ]}
            />
        </QueryClientProvider>,
    )
    return { onClose }
}

async function elegir(nombre: RegExp) {
    await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
    await userEvent.click(await screen.findByRole('button', { name: nombre }))
}

beforeEach(() => vi.clearAllMocks())

describe('AgregarClienteRutaBaseDialog', () => {
    it('agrega el cliente elegido a la celda del "+"', async () => {
        vi.mocked(api.buscarEnRutaBase).mockResolvedValue([
            { codigoParticularCliente: 'P001', nombreCliente: 'ALMACEN ZARATE', celdas: [] },
        ])
        vi.mocked(api.agregarARutaBase).mockResolvedValue({
            id: 50,
            codigoParticularCliente: 'P001',
            nombreCliente: 'ALMACEN ZARATE',
            semana: 2,
            dia: 3,
        })
        const { onClose } = renderDialog()

        await elegir(/Almacen Zarate/i)
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        await waitFor(() =>
            expect(api.agregarARutaBase).toHaveBeenCalledWith('V 2', {
                codigoCliente: 'P001',
                semana: 2,
                dia: 3,
            }),
        )
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('si ya está en otras celdas las muestra, pero deja agregarlo', async () => {
        vi.mocked(api.buscarEnRutaBase).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'ALMACEN ZARATE',
                celdas: [{ id: 9, semana: 1, dia: 1 }],
            },
        ])
        renderDialog()

        await elegir(/Almacen Zarate/i)

        expect(screen.getByText(/LUN · Norte \(Semana 1\)/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Agregar' })).toBeEnabled()
    })

    it('si ya está en esta misma celda no ofrece agregarlo', async () => {
        vi.mocked(api.buscarEnRutaBase).mockResolvedValue([
            {
                codigoParticularCliente: 'P001',
                nombreCliente: 'ALMACEN ZARATE',
                celdas: [{ id: 9, semana: 2, dia: 3 }],
            },
        ])
        renderDialog()

        await elegir(/Almacen Zarate/i)

        expect(screen.getByText(/ya está en la ruta base acá/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
    })

    it('si el backend lo rechaza por estar fuera de la cartera, lo dice', async () => {
        vi.mocked(api.buscarEnRutaBase).mockResolvedValue([
            { codigoParticularCliente: 'P001', nombreCliente: 'ALMACEN ZARATE', celdas: [] },
        ])
        vi.mocked(api.agregarARutaBase).mockRejectedValue({
            response: { status: 404, data: { code: 'CLIENTE_FUERA_DE_CARTERA' } },
        })
        renderDialog()

        await elegir(/Almacen Zarate/i)
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))

        expect(await screen.findByText(/no es de la cartera/)).toBeInTheDocument()
    })
})
