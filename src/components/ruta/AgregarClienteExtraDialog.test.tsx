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
                descripcionSemana="Zárate"
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

    it('si ya está en otra celda, avisa y pide confirmar', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 1, dia: 2, eliminado: false }],
        })
        vi.mocked(api.agregarClienteExtraAdmin).mockResolvedValue({
            rotacionClienteId: 44,
        } as never)

        renderDialog()
        await userEvent.type(screen.getByPlaceholderText(/Nombre o código/), 'alma')
        await userEvent.click(await screen.findByRole('button', { name: /Almacen Zarate/i }))

        expect(await screen.findByText(/ya está planificado/)).toBeInTheDocument()
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(api.agregarClienteExtraAdmin).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Agregar de todos modos' }))
        await waitFor(() =>
            expect(api.agregarClienteExtraAdmin).toHaveBeenCalledWith('V 2', 7, 'P001', 2, 3),
        )
    })

    it('si ya está en ESTA celda, no ofrece agregar', async () => {
        vi.mocked(api.consultarClienteAdmin).mockResolvedValue({
            yaPlanificado: true,
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: false }],
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
            celdas: [{ rotacionClienteId: 11, semana: 2, dia: 3, eliminado: true }],
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
