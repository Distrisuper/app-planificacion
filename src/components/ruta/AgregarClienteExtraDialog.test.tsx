import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import AgregarClienteExtraDialog from './AgregarClienteExtraDialog'

vi.mock('@/api/planificacionAdmin')

const CLIENTE = {
    codigoParticularCliente: 'P001',
    nombreCliente: 'ALMACEN ZARATE',
    estado: 'sin_plan' as const,
    semana: null,
    dia: null,
    descripcionZona: null,
    fecha: null,
    motivo: null,
}

function renderDialog(props: Partial<React.ComponentProps<typeof AgregarClienteExtraDialog>> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <AgregarClienteExtraDialog
                open
                onClose={vi.fn()}
                codigoVendedor="V 2"
                rotacionId={7}
                semana={2}
                dia={3}
                zonas={[
                    { semana: 1, descripcion: null },
                    { semana: 2, descripcion: 'Zárate' },
                    { semana: 4, descripcion: 'Norte' },
                ]}
                {...props}
            />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.buscarEnCarteraAdmin).mockResolvedValue([CLIENTE])
})

describe('AgregarClienteExtraDialog', () => {
    it('dice a qué celda va lo que se agregue', () => {
        renderDialog()
        expect(screen.getByText(/Zárate/)).toBeInTheDocument()
        expect(screen.getByText(/MIE/)).toBeInTheDocument()
    })

    it('sin fila previa, agrega directo', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)
        const onAgregado = vi.fn()

        renderDialog({ onAgregado })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        await waitFor(() =>
            expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3),
        )
        expect(onAgregado).toHaveBeenCalled()
    })

    it('si ya está en otra celda, ofrece traer esa visita o agregar una nueva', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false, resuelto: false }],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/ya está en esta vuelta/)).toBeInTheDocument()
        // La zona 1 no está nombrada: cae al número, igual que el grid.
        expect(screen.getByText('MAR · Semana 1')).toBeInTheDocument()
        expect(api.agregarClienteExtraAdmin).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Agregar otra visita' }))
        await waitFor(() =>
            expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3),
        )
    })

    it('traer mueve ESA fila a la celda del +, sin crear ninguna', async () => {
        // Un quincenal: dos filas en la vuelta, y hay que poder elegir cuál se trae.
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [
                { rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false, resuelto: false },
                { rotacionClienteId: 12, semana: 4, dia: 1, eliminado: false, resuelto: false },
            ],
        })
        vi.mocked(api.reacomodarAdmin).mockResolvedValue(undefined)
        const onClose = vi.fn()

        renderDialog({ onClose })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText('MAR · Semana 1')).toBeInTheDocument()
        expect(screen.getByText('LUN · Norte (Semana 4)')).toBeInTheDocument()

        // Se trae la SEGUNDA, no la primera: es el caso que un botón único no cubre.
        await userEvent.click(
            screen.getByRole('button', { name: 'Traer acá la visita del LUN · Norte (Semana 4)' }),
        )

        await waitFor(() =>
            expect(api.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, 12, {
                semana: 2,
                dia: 3,
            }),
        )
        expect(api.agregarClienteExtraAdmin).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('no ofrece traer una visita ya resuelta: dice por qué', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false, resuelto: true }],
        })

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText('MAR · Semana 1')).toBeInTheDocument()
        // `reacomodar` la rechazaría con 409 FILA_RESUELTA: no se ofrece el botón.
        expect(screen.queryByRole('button', { name: /^Traer acá/ })).not.toBeInTheDocument()
        expect(screen.getByText(/Ya resuelta/)).toBeInTheDocument()
        // Agregar otra visita sigue siendo válido: la de allá ya pasó.
        expect(screen.getByRole('button', { name: 'Agregar otra visita' })).toBeInTheDocument()
    })

    it('avisa si traer falla, sin cerrarse', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false, resuelto: false }],
        })
        vi.mocked(api.reacomodarAdmin).mockRejectedValue(new Error('boom'))
        const onClose = vi.fn()

        renderDialog({ onClose })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(
            await screen.findByRole('button', { name: 'Traer acá la visita del MAR · Semana 1' }),
        )

        expect(await screen.findByText(/No se pudo mover/)).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('si ya está en ESTA celda, no ofrece agregar', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: false, resuelto: false }],
        })

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/ya está planificado acá/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Agregar de todos modos' }),
        ).not.toBeInTheDocument()
    })

    it('si la fila de esta celda está quitada, agregar la restaura', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: true, resuelto: false }],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 11,
        } as never)

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/está quitado de este día/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
        await waitFor(() => expect(api.agregarClienteExtraAdmin).toHaveBeenCalled())
    })

    it('avisa si la creación falla, sin cerrarse', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: false,
            celdas: [],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockRejectedValue(new Error('boom'))
        const onClose = vi.fn()

        renderDialog({ onClose })
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))
        await userEvent.click(await screen.findByRole('button', { name: 'Agregar' }))

        expect(await screen.findByText(/No se pudo agregar/)).toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })
})
