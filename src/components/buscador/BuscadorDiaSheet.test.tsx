import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BuscadorDiaSheet } from './BuscadorDiaSheet'
import { useConfirmarExtra, useConsultarBuscador, useBuscarEnCartera } from '@/hooks/useBuscador'
import { useReacomodar } from '@/hooks/useCiclo'

vi.mock('@/hooks/useBuscador')
vi.mock('@/hooks/useCiclo')

beforeEach(() => {
    vi.mocked(useBuscarEnCartera).mockReturnValue({ data: [], buscando: false } as any)
    vi.mocked(useConsultarBuscador).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
    vi.mocked(useConfirmarExtra).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
    vi.mocked(useReacomodar).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
})

it('ofrece "Cliente nuevo" debajo de la búsqueda cuando el llamador lo pasa', () => {
    const onClienteNuevo = vi.fn()
    render(<BuscadorDiaSheet open onClose={() => {}} semana={2} dia={3} onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={() => {}} onClienteNuevo={onClienteNuevo} />)
    fireEvent.click(screen.getByRole('button', { name: /cliente nuevo/i }))
    expect(onClienteNuevo).toHaveBeenCalled()
})

// Back #324: la fila de otra semana puede ser una visita de la Ruta sin fila (id negativo). Si
// cambió desde la consulta, el back contesta 409 y ese id ya no sirve: reintentar con el mismo
// daría otro 409. Se vuelve a la búsqueda para que elegir al cliente lo consulte de nuevo.
it('si la visita a traer cambió desde la consulta (409), avisa y vuelve a la búsqueda', async () => {
    vi.mocked(useBuscarEnCartera).mockReturnValue({
        data: [{ codigoParticularCliente: 'P1', nombreCliente: 'Almacén Uno' }],
        buscando: false,
    } as any)
    vi.mocked(useConsultarBuscador).mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue({
            estado: 'pendiente_otra_zona',
            filaExistente: null,
            otraZona: { rotacionClienteId: -400231, semana: 4, dia: 1, descripcionZona: null, fechaLunes: '2026-11-23' },
        }),
        isPending: false,
    } as any)
    const mutateAsync = vi.fn().mockRejectedValue({ response: { status: 409, data: { code: 'VISITA_VIRTUAL_VENCIDA' } } })
    vi.mocked(useReacomodar).mockReturnValue({ mutateAsync, isPending: false } as any)
    const onAviso = vi.fn()
    render(<BuscadorDiaSheet open onClose={() => {}} semana={3} dia={2} fechaLunes="2026-11-16" onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={onAviso} />)

    fireEvent.click(screen.getByRole('button', { name: /almacén uno/i }))
    fireEvent.click(await screen.findByRole('button', { name: /traerlo al/i }))

    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('error', expect.stringMatching(/esa visita cambió/i)))
    expect(mutateAsync).toHaveBeenCalledWith({ rotacionClienteId: -400231, dia: 2, fechaLunes: '2026-11-16' })
    expect(screen.queryByRole('button', { name: /traerlo al/i })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/nombre o código/i)).toBeInTheDocument()
})

it('sin onClienteNuevo no muestra el botón', () => {
    render(<BuscadorDiaSheet open onClose={() => {}} semana={2} dia={3} onExtraCreada={() => {}} onNavegarAExistente={() => {}} onTraido={() => {}} onAviso={() => {}} />)
    expect(screen.queryByRole('button', { name: /cliente nuevo/i })).not.toBeInTheDocument()
})
