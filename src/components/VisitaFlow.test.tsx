import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaFlow from './VisitaFlow'
import * as api from '@/api/planificacion'
import * as geo from '@/lib/geolocation'
import type { IAgendaClient } from '@/types/planificacion'

vi.mock('@/api/planificacion')
vi.mock('@/lib/geolocation')
vi.mock('leaflet', () => {
    const map = { setView: vi.fn().mockReturnThis(), remove: vi.fn(), fitBounds: vi.fn() }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
            divIcon: vi.fn(() => ({})),
        },
    }
})

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
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [] })
    ;(api.getRubros as any).mockResolvedValue([])
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99, rubros: 3 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
})

it('iniciar visita captura la ubicación y manda el cicloClienteId', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            cicloClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('con el permiso denegado NO inicia la visita', async () => {
    // La geolocalización bloquea: el dato existe para verificar la presencia, así que
    // su captura no puede quedar a criterio del verificado.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: false,
        motivo: 'denegado',
    })
    const { onGeoBloqueada } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('denegado'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('sin señal tampoco inicia', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: false,
        motivo: 'sin_senal',
    })
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

it('al iniciar avisa con una notificación de éxito', async () => {
    const { onAviso } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('exito', 'Visita iniciada'))
})

it('aunque el cliente de la agenda siga en pendiente, tras iniciar se ve como en curso', async () => {
    // `cliente` es la foto tomada al abrir el flujo: no se actualiza sola a 'en_curso'
    // hasta que se cierre y reabra. El indicador de en curso no puede depender de eso.
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByText(/en curso/i)
    expect(screen.getByLabelText('Minimizar')).toBeInTheDocument()
})

it('un cliente con visita en curso entra directo a los rubros', async () => {
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    await waitFor(() => expect(api.getRubros).toHaveBeenCalledWith(55))
    expect(api.getPropuesta).not.toHaveBeenCalled()
})

it('al cerrar sin rubros pendientes avisa con una notificación de éxito', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        rubrosPendientes: 0,
    })
    const { onAviso } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('exito', 'Visita cerrada'))
})

it('cerrar visita también exige ubicación', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        rubrosPendientes: 0,
    })
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, {
            coordFinal: '-34.6,-58.4',
        }),
    )
})

it('cerrar visita con la ubicación bloqueada no cierra', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: false,
        motivo: 'sin_senal',
    })
    const { onGeoBloqueada } = renderFlow({
        cliente: { ...cliente, estado: 'en_curso', visitaId: 55 },
    })
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
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Este cliente ya fue resuelto. Actualizamos tu agenda.',
        ),
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
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Este cliente ya fue resuelto. Actualizamos tu agenda.',
        ),
    )
    expect(onClose).toHaveBeenCalled()
})

it('si iniciar falla por un error genérico, muestra el error inline y NO cierra el flujo', async () => {
    ;(api.iniciarVisita as any).mockRejectedValue({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    const { onClose } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    expect(await screen.findByText('No se pudo iniciar la visita. Volvé a intentar.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    // El flujo sigue abierto en la propuesta: el botón de iniciar visita sigue disponible y
    // habilitado para reintentar.
    const boton = screen.getByRole('button', { name: /iniciar visita/i })
    expect(boton).toBeInTheDocument()
    expect(boton).toBeEnabled()
})

it('reintentar tras un error genérico limpia el mensaje anterior', async () => {
    ;(api.iniciarVisita as any).mockRejectedValueOnce({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByText('No se pudo iniciar la visita. Volvé a intentar.')

    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(
            screen.queryByText('No se pudo iniciar la visita. Volvé a intentar.'),
        ).not.toBeInTheDocument(),
    )
})

it('con coordenadas, un error genérico se muestra inline en el mapa sin cerrarlo', async () => {
    ;(api.iniciarVisita as any).mockRejectedValue({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))

    expect(await screen.findByText('No se pudo iniciar la visita. Volvé a intentar.')).toBeInTheDocument()
    expect(screen.getByTestId('mapa-iniciar-visita')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeEnabled()
})

it('si cerrar falla porque la visita ya estaba cerrada, lo trata como éxito y cierra el flujo', async () => {
    ;(api.cerrarVisita as any).mockRejectedValue({
        response: { data: { code: 'VISITA_YA_CERRADA' } },
    })
    const { onClose } = renderFlow({
        cliente: { ...cliente, estado: 'en_curso', visitaId: 55 },
    })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
})

it('con coordenadas del cliente, iniciar visita muestra el mapa en vez de arrancar directo', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    expect(await screen.findByTestId('mapa-iniciar-visita')).toBeInTheDocument()
    expect(api.iniciarVisita).not.toHaveBeenCalled()
})

it('confirmar en el mapa recién ahí arranca la visita', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            cicloClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('cancelar en el mapa vuelve a la propuesta sin iniciar nada', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByLabelText('Cancelar'))
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
    expect(api.iniciarVisita).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /iniciar visita/i })).toBeInTheDocument()
})

it('minimizar oculta los rubros y muestra la barra flotante; expandir la vuelve a mostrar', async () => {
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    await screen.findByRole('button', { name: /cerrar visita/i })
    fireEvent.click(screen.getByLabelText('Minimizar'))
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
    expect(screen.getByText(/visitando a/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/visitando a/i))
    expect(await screen.findByRole('button', { name: /cerrar visita/i })).toBeInTheDocument()
})

it('si cerrar falla por un error genérico, avisa y NO cierra el flujo', async () => {
    ;(api.cerrarVisita as any).mockRejectedValue({
        response: { data: { code: 'ALGO_INESPERADO' } },
    })
    const { onAviso, onClose } = renderFlow({
        cliente: { ...cliente, estado: 'en_curso', visitaId: 55 },
    })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith(
            'error',
            'No se pudo cerrar la visita. Volvé a intentar.',
        ),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeInTheDocument()
})
