import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaFlow from './VisitaFlow'
import * as api from '@/api/planificacion'
import * as geo from '@/lib/geolocation'
import type { IAgendaClient } from '@/types/planificacion'

vi.mock('@/api/planificacion')
vi.mock('@/lib/geolocation')

const cliente: IAgendaClient = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    cicloClienteId: 42,
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    rubrosPendientes: 0,
}

function renderFlow(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onGeoBloqueada = vi.fn()
    const onClose = vi.fn()
    const onAviso = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaFlow
                cliente={cliente}
                onClose={onClose}
                onGeoBloqueada={onGeoBloqueada}
                onAviso={onAviso}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onGeoBloqueada, onClose, onAviso }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getPropuesta as any).mockResolvedValue({ clients: [{ rubros: [] }] })
    ;(api.getRubros as any).mockResolvedValue([])
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99, rubros: 3 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true, coord: '-34.6,-58.4', precisionM: 10,
    })
})

it('iniciar visita captura la ubicación y manda el cicloClienteId', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            cicloClienteId: 42,
            coordInicio: '-34.6,-58.4',
        }),
    )
})

it('con el permiso denegado NO inicia la visita', async () => {
    // La geolocalización bloquea: el dato existe para verificar la presencia, así que
    // su captura no puede quedar a criterio del verificado.
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'denegado' })
    const { onGeoBloqueada } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('denegado'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('sin señal tampoco inicia', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'sin_senal' })
    const { onGeoBloqueada } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('sin_senal'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('tras iniciar pasa a los rubros congelados', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(api.getRubros).toHaveBeenCalledWith(99))
})

it('un cliente con visita en curso entra directo a los rubros', async () => {
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    await waitFor(() => expect(api.getRubros).toHaveBeenCalledWith(55))
    expect(api.getPropuesta).not.toHaveBeenCalled()
})

it('cerrar visita también exige ubicación', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, rubrosPendientes: 0 })
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
})

it('cerrar visita con la ubicación bloqueada no cierra', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'sin_senal' })
    const { onGeoBloqueada } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('sin_senal'))
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})

it('si iniciar falla porque el cliente ya estaba resuelto, avisa y cierra el flujo', async () => {
    ;(api.iniciarVisita as any).mockRejectedValue({
        response: { data: { code: 'VISITA_ACTIVA_EXISTENTE' } },
    })
    const { onAviso, onClose } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('Este cliente ya fue resuelto. Actualizamos tu agenda.'),
    )
    expect(onClose).toHaveBeenCalled()
})

it('si iniciar falla porque el ciclo cliente ya estaba resuelto, avisa y cierra el flujo', async () => {
    ;(api.iniciarVisita as any).mockRejectedValue({
        response: { data: { code: 'CICLO_CLIENTE_YA_RESUELTO' } },
    })
    const { onAviso, onClose } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('Este cliente ya fue resuelto. Actualizamos tu agenda.'),
    )
    expect(onClose).toHaveBeenCalled()
})

it('si iniciar falla por un error genérico, avisa y NO cierra el flujo', async () => {
    ;(api.iniciarVisita as any).mockRejectedValue({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    const { onAviso, onClose } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('No se pudo iniciar la visita. Volvé a intentar.'),
    )
    expect(onClose).not.toHaveBeenCalled()
    // El flujo sigue abierto en la propuesta: el botón de iniciar visita sigue disponible.
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeInTheDocument()
})

it('si cerrar falla porque la visita ya estaba cerrada, lo trata como éxito y cierra el flujo', async () => {
    ;(api.cerrarVisita as any).mockRejectedValue({
        response: { data: { code: 'VISITA_YA_CERRADA' } },
    })
    const { onClose } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
})

it('si cerrar falla por un error genérico, avisa y NO cierra el flujo', async () => {
    ;(api.cerrarVisita as any).mockRejectedValue({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    const { onAviso, onClose } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('No se pudo cerrar la visita. Volvé a intentar.'),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeInTheDocument()
})
