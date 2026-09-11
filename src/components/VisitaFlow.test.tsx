import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaFlow, { type IVisitaEnCurso } from './VisitaFlow'
import VisitaEnCursoBar from './VisitaEnCursoBar'
import * as api from '@/api/planificacion'
import * as geo from '@/lib/geolocation'
import { leerVisitaEnCurso } from '@/lib/visitaEnCurso'
import type { IAgendaClient } from '@/types/planificacion'

vi.mock('@/api/planificacion')
vi.mock('@/lib/geolocation')
vi.mock('leaflet', () => {
    const map = { setView: vi.fn().mockReturnThis(), remove: vi.fn(), fitBounds: vi.fn(), on: vi.fn() }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    const circle = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
            circle: vi.fn(() => circle),
            divIcon: vi.fn(() => ({})),
        },
    }
})

const cliente: IAgendaClient = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    rotacionClienteId: 42,
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    ofrecimientosPendientes: 0,
    seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null },
    esExtra: false,
}

interface HarnessProps {
    clienteInicial: IAgendaClient | null
    /** Si se pasa, se renderiza un botón de test que simula tocar la card de OTRO cliente
     *  (como haría AgendaBoard) sin cerrar el flujo del que ya estaba abierto. */
    otroCliente?: IAgendaClient
    directoAMapa?: boolean
    onGeoBloqueada: (motivo: any) => void
    onAviso: (tipo: any, mensaje: string) => void
    onClose: () => void
    onVisitaIniciada: (cliente: IAgendaClient, visitaId: number) => void
    onVisitaCerrada: () => void
}

/**
 * Reproduce la porción relevante de AgendaSemanaPage: quién es el cliente cuyo sheet está
 * abierto (`cliente`, un solo slot que cambia si se toca otra card) versus la visita en
 * curso (`visitaEnCurso`, independiente de eso). VisitaFlow ya no gestiona internamente
 * esa segunda pieza de estado — así que probarlo aislado sin este wrapper no reproduciría
 * el bug real (la barra flotante se sostiene desde el padre, no desde VisitaFlow).
 */
function Harness({
    clienteInicial,
    otroCliente,
    directoAMapa,
    onGeoBloqueada,
    onAviso,
    onClose,
    onVisitaIniciada,
    onVisitaCerrada,
}: HarnessProps) {
    const [cliente, setCliente] = useState<IAgendaClient | null>(clienteInicial)
    const [visitaEnCurso, setVisitaEnCurso] = useState<IVisitaEnCurso | null>(
        clienteInicial && clienteInicial.estado === 'en_curso' && clienteInicial.visitaId !== null
            ? { cliente: clienteInicial, visitaId: clienteInicial.visitaId }
            : null,
    )
    const [alejado, setAlejado] = useState(false)
    const viendoVisitaEnCurso =
        visitaEnCurso !== null && cliente !== null && cliente.rotacionClienteId === visitaEnCurso.cliente.rotacionClienteId

    return (
        <>
            {otroCliente && (
                <button onClick={() => setCliente(otroCliente)}>Abrir {otroCliente.nombreCliente}</button>
            )}
            <VisitaFlow
                cliente={cliente}
                visitaEnCurso={visitaEnCurso}
                directoAMapa={directoAMapa}
                onVisitaIniciada={(c, id) => {
                    setVisitaEnCurso({ cliente: c, visitaId: id })
                    onVisitaIniciada(c, id)
                }}
                onVisitaCerrada={() => {
                    setVisitaEnCurso(null)
                    onVisitaCerrada()
                }}
                onClose={() => {
                    setCliente(null)
                    onClose()
                }}
                onGeoBloqueada={onGeoBloqueada}
                onAviso={onAviso}
                onAlejadoChange={setAlejado}
            />
            {visitaEnCurso && !viendoVisitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente}
                    alejado={alejado}
                    onExpandir={() => setCliente(visitaEnCurso.cliente)}
                />
            )}
        </>
    )
}

function renderFlow(
    over: {
        cliente?: IAgendaClient
        otroCliente?: IAgendaClient
        directoAMapa?: boolean
    } = {},
) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onGeoBloqueada = vi.fn()
    const onClose = vi.fn()
    const onAviso = vi.fn()
    const onVisitaIniciada = vi.fn()
    const onVisitaCerrada = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <Harness
                clienteInicial={over.cliente ?? cliente}
                otroCliente={over.otroCliente}
                directoAMapa={over.directoAMapa}
                onGeoBloqueada={onGeoBloqueada}
                onAviso={onAviso}
                onClose={onClose}
                onVisitaIniciada={onVisitaIniciada}
                onVisitaCerrada={onVisitaCerrada}
            />
        </QueryClientProvider>,
    )
    return { onGeoBloqueada, onClose, onAviso, onVisitaIniciada, onVisitaCerrada }
}

beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [] })
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99, ofrecimientos: 3 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
    // `vi.mock('@/lib/geolocation')` automockea TODO el módulo, así que sin esto
    // formatearCoord queda como un stub que devuelve undefined.
    ;(geo.formatearCoord as any).mockImplementation((v: number) => v.toFixed(8))
})

afterEach(() => vi.unstubAllGlobals())

/** jsdom no expone navigator.geolocation por defecto — a diferencia de
 *  capturarUbicacion() (mockeado arriba), acá se necesita el watch EN VIVO que usa
 *  MapaVisita para el gate de distancia. Solo hace falta en los tests que
 *  verifican ese gate contra la posición reposicionada. */
function mockGeolocacionEnVivo(coords: { latitude: number; longitude: number; accuracy: number }) {
    const watchPosition = vi.fn((ok: any) => {
        ok({ coords })
        return 1
    })
    const getCurrentPosition = vi.fn()
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition, getCurrentPosition, clearWatch } })
}

it('iniciar visita captura la ubicación y manda el rotacionClienteId', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
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
    await waitFor(() => expect(api.getOfrecimientos).toHaveBeenCalledWith(99))
})

it('al iniciar visita, persiste la visita en curso en localStorage', async () => {
    // Ancla local para sobrevivir a recargar la app sin señal — ver
    // docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md, sección 0.
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(leerVisitaEnCurso()).toEqual({ cliente, visitaId: 99 }),
    )
})

it('al cerrar visita, limpia la visita en curso persistida', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        ofrecimientosPendientes: 0,
    })
    const clienteEnCurso = { ...cliente, estado: 'en_curso' as const, visitaId: 55 }
    renderFlow({ cliente: clienteEnCurso })
    // Antes de cerrar ya hay algo guardado — es lo que se espera limpiar.
    await waitFor(() => expect(api.getOfrecimientos).toHaveBeenCalledWith(55))
    localStorage.setItem(
        'visita-en-curso',
        JSON.stringify({ cliente: clienteEnCurso, visitaId: 55 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(leerVisitaEnCurso()).toBeNull())
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
    await waitFor(() => expect(api.getOfrecimientos).toHaveBeenCalledWith(55))
    expect(api.getPropuesta).not.toHaveBeenCalled()
})

it('al cerrar sin rubros pendientes avisa con una notificación de éxito', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        ofrecimientosPendientes: 0,
    })
    const { onAviso } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('exito', 'Visita cerrada'))
})

it('al cerrar con rubros pendientes no promete que se puedan cargar después', async () => {
    // Cerrada la visita, el sheet queda read-only: esos rubros se perdieron. El aviso no
    // puede invitar a cargarlos más tarde, porque no hay dónde.
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        ofrecimientosPendientes: 2,
    })
    const { onAviso } = renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Visita cerrada. Quedaron 2 rubros sin cargar.',
        ),
    )
})

it('cerrar visita también exige ubicación', async () => {
    ;(api.cerrarVisita as any).mockResolvedValue({
        visitaId: 55,
        ofrecimientosPendientes: 0,
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

it('el botón se deshabilita apenas se toca, antes de que resuelva la geolocalización, y un segundo tap no dispara una segunda llamada', async () => {
    // La captura de GPS puede tardar hasta ~23s (ver capturarUbicacion). Si el botón no se
    // deshabilita hasta que ESA promesa resuelve, el vendedor lo vuelve a tocar creyendo que
    // no respondió, y se disparan llamadas concurrentes a iniciarVisita.
    let resolverGeo!: (r: { ok: true; coord: string; precisionM: number }) => void
    ;(geo.capturarUbicacion as any).mockReturnValue(
        new Promise(resolve => {
            resolverGeo = resolve
        }),
    )
    renderFlow()
    const boton = await screen.findByRole('button', { name: /iniciar visita/i })
    fireEvent.click(boton)

    await waitFor(() => expect(boton).toBeDisabled())
    fireEvent.click(boton)

    resolverGeo({ ok: true, coord: '-34.6,-58.4', precisionM: 10 })
    await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
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
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('directoAMapa: si la propuesta falla, no deja al vendedor trabado en el spinner', async () => {
    // El spinner de carga tapa toda la pantalla y no tiene botón de cerrar: si la
    // propuesta falla y solo se mira `data` (que queda undefined para siempre), la app
    // queda inusable hasta reiniciarla. En la calle, con señal mala, eso pasa seguido.
    ;(api.getPropuesta as any).mockRejectedValue(new Error('sin señal'))
    renderFlow({
        cliente: { ...cliente, latitud: -34.6, longitud: -58.4 },
        directoAMapa: true,
    })

    await waitFor(() =>
        expect(screen.queryByTestId('cargando-propuesta')).not.toBeInTheDocument(),
    )
    // Y tiene que quedar en un estado del que pueda salir o reintentar.
    expect(await screen.findByText(/no pudimos traer la propuesta/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /volver a intentar/i })).toBeInTheDocument()
})

it('directoAMapa con coordenadas salta la propuesta y va derecho al mapa', async () => {
    renderFlow({
        cliente: { ...cliente, latitud: -34.6, longitud: -58.4 },
        directoAMapa: true,
    })
    expect(await screen.findByTestId('mapa-iniciar-visita')).toBeInTheDocument()
    expect(screen.queryByText(/días del mes/i)).not.toBeInTheDocument()
    // Igual pide la propuesta: el backend la exige para congelarla al confirmar en el mapa.
    await waitFor(() => expect(api.getPropuesta).toHaveBeenCalledWith('10034'))
    expect(api.iniciarVisita).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('directoAMapa sin coordenadas cae al flujo normal de la propuesta', async () => {
    renderFlow({ directoAMapa: true })
    expect(await screen.findByText(/días del mes/i)).toBeInTheDocument()
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('directoAMapa: cancelar en el mapa lo cierra de verdad y no lo reabre solo', async () => {
    // `cargandoDirecto` incluye `propuestaPendiente === null`, y el efecto que setea
    // propuestaPendiente depende de `cargandoDirecto`. Al cancelar, propuestaPendiente
    // vuelve a null → cargandoDirecto vuelve a true → el efecto lo vuelve a setear con la
    // propuesta que sigue en cache → el mapa se reabre solo. El vendedor no podía salir.
    renderFlow({
        cliente: { ...cliente, latitud: -34.6, longitud: -58.4 },
        directoAMapa: true,
    })
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByLabelText('Cancelar'))

    await waitFor(() =>
        expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument(),
    )
    // Y sigue cerrado: nada lo vuelve a abrir en los ticks siguientes.
    await new Promise(r => setTimeout(r, 150))
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
    expect(api.iniciarVisita).not.toHaveBeenCalled()
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

const otroCliente: IAgendaClient = {
    codigoCliente: 'C2',
    codigoParticularCliente: '20099',
    nombreCliente: 'KIOSCO SUR',
    rotacionClienteId: 77,
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    ofrecimientosPendientes: 0,
    seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null },
    esExtra: false,
}

it('la visita en curso sigue viva aunque se abra y cierre la propuesta de otro cliente', async () => {
    renderFlow({ otroCliente })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByLabelText('Minimizar')

    // El vendedor toca la card de otro cliente sin cerrar la visita en curso.
    fireEvent.click(screen.getByRole('button', { name: /kiosco sur/i }))
    await screen.findByRole('button', { name: /iniciar visita/i })

    // La cierra sin hacer nada más.
    fireEvent.click(screen.getByLabelText('Cerrar'))

    // La visita de ALMACEN DON JOSE sigue en curso: la barra flotante reaparece sola.
    expect(await screen.findByText(/visitando a almacen don jose/i)).toBeInTheDocument()
})

it('con una visita en curso, iniciar en otro cliente queda bloqueado con aviso', async () => {
    renderFlow({ otroCliente })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByLabelText('Minimizar')

    fireEvent.click(screen.getByRole('button', { name: /kiosco sur/i }))
    const botonIniciar = await screen.findByRole('button', { name: /iniciar visita/i })

    expect(botonIniciar).toBeDisabled()
    expect(
        screen.getByText(/ya tenés una visita en curso con almacen don jose/i),
    ).toBeInTheDocument()

    fireEvent.click(botonIniciar)
    // Ya se había llamado una vez para iniciar la visita de Don José: el tap sobre el
    // botón deshabilitado de Kiosco Sur no debe sumar una segunda llamada.
    expect(api.iniciarVisita).toHaveBeenCalledTimes(1)
})

/** Mismo helper que en MapaVisita.test.tsx — necesario acá porque el mapa
 *  real (no mockeado) es parte del árbol que VisitaFlow renderiza. */
async function getClickHandler() {
    const L = await import('leaflet')
    const mapMock = L.default.map as any
    const map = mapMock.mock.results[mapMock.mock.results.length - 1].value
    const calls = map.on.mock.calls.filter((c: any) => c[0] === 'click')
    return calls[calls.length - 1][1] as (e: { latlng: { lat: number; lng: number } }) => void
}

it('reposicionar destraba el gate y manda coordCliente al iniciar', async () => {
    // El vendedor está lejos de la coordenada ORIGINAL del cliente.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.603,-58.4',
        precisionM: 10,
    })
    mockGeolocacionEnVivo({ latitude: -34.603, longitude: -58.4, accuracy: 10 })
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    // Reposiciona exacto donde está el vendedor.
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })

    const boton = await screen.findByRole('button', { name: /^iniciar visita$/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)

    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.603,-58.4',
            // Truncado a 8 decimales — mismo motivo que coordInicio (formatearCoord):
            // el regex del backend rechaza los ~15-17 decimales crudos de e.latlng.
            coordCliente: '-34.60300000,-58.40000000',
            propuesta: [],
        }),
    )
})

it('reposicionar y quedarse ahí NO dispara "te alejaste": el ancla es la posición nueva', async () => {
    // Regresión: el gate de "estás lejos" al iniciar YA usaba clienteOverride (test de
    // arriba), pero lo que quedaba guardado como visitaEnCurso.cliente seguía siendo el
    // `cliente` original — así que apenas arrancaba la visita, useAlejadoDelCliente
    // comparaba contra la coordenada VIEJA y avisaba "te alejaste" estando parado justo
    // donde se reposicionó.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.603,-58.4',
        precisionM: 10,
    })
    mockGeolocacionEnVivo({ latitude: -34.603, longitude: -58.4, accuracy: 10 })
    const { onAviso } = renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })

    const boton = await screen.findByRole('button', { name: /^iniciar visita$/i })
    await waitFor(() => expect(boton).toBeEnabled())
    fireEvent.click(boton)

    await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalled())
    await screen.findByLabelText('Minimizar')

    expect(onAviso).not.toHaveBeenCalledWith('info', expect.stringContaining('alejaste'))
})

it('sin reposicionar, coordCliente no viaja en el payload', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))

    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('cancelar el mapa descarta el reposicionamiento', async () => {
    renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.61, lng: -58.41 } })
    await screen.findByText(/posición ajustada/i)

    fireEvent.click(screen.getByLabelText('Cancelar'))
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()

    // Reabre el flujo desde cero: si el override sobreviviera, se mandaría igual.
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /^iniciar visita$/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            propuesta: [],
        }),
    )
})

it('si el backend avisa que ya se agotó el cupo de corrección permanente, muestra el aviso discreto', async () => {
    ;(api.iniciarVisita as any).mockResolvedValue({
        visitaId: 99,
        ofrecimientos: 0,
        correccionPermanenteAplicada: false,
    })
    // La segunda verificación de distancia (onIniciar) usa el coord de
    // capturarUbicacion contra la posición reposicionada — tienen que coincidir para
    // que no la rechace por "lejos del cliente".
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.41',
        precisionM: 10,
    })
    const { onAviso } = renderFlow({ cliente: { ...cliente, latitud: -34.6, longitud: -58.4 } })
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    fireEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.61, lng: -58.41 } })

    const botonIniciar = screen.getByRole('button', { name: /^iniciar visita$/i })
    await waitFor(() => expect(botonIniciar).toBeEnabled())
    fireEvent.click(botonIniciar)

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Esta corrección ya no se guarda de forma permanente (límite alcanzado).',
        ),
    )
})

it('sin reposicionar, aunque el backend no mande correccionPermanenteAplicada, no avisa nada raro', async () => {
    const { onAviso } = renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith('exito', 'Visita iniciada'))
    expect(onAviso).not.toHaveBeenCalledWith('info', expect.stringContaining('límite'))
})

// Aviso de "te alejaste del cliente" con la visita abierta — spec
// 2026-09-08-aviso-alejado-del-cliente-design.md. Las coordenadas del hook salen de
// `visitaEnCurso.cliente` (con coords), no del `cliente` que esté abierto en pantalla.
function mockGeolocacionEnVivoAlejado(
    coords: { latitude: number; longitude: number; accuracy: number },
) {
    let entregarFix: any
    const watchPosition = vi.fn((ok: any) => {
        entregarFix = ok
        ok({ coords })
        return 1
    })
    const getCurrentPosition = vi.fn()
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition, getCurrentPosition, clearWatch } })
    return { reentregar: (c: typeof coords) => entregarFix({ coords: c }) }
}

it('cuando el vendedor se aleja del cliente en curso, avisa con un toast', async () => {
    const clienteConCoords = { ...cliente, latitud: -34.6, longitud: -58.4 }
    mockGeolocacionEnVivoAlejado({ latitude: -34.61, longitude: -58.41, accuracy: 5 })
    const { onAviso } = renderFlow({
        cliente: { ...clienteConCoords, estado: 'en_curso', visitaId: 55 },
    })
    await screen.findByLabelText('Minimizar')

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith(
            'info',
            'Te alejaste de ALMACEN DON JOSE y la visita sigue abierta.',
        ),
    )
})

it('cerca del cliente en curso, no avisa nada de alejarse', async () => {
    const clienteConCoords = { ...cliente, latitud: -34.6, longitud: -58.4 }
    mockGeolocacionEnVivoAlejado({ latitude: -34.6, longitude: -58.4, accuracy: 5 })
    const { onAviso } = renderFlow({
        cliente: { ...clienteConCoords, estado: 'en_curso', visitaId: 55 },
    })
    await screen.findByLabelText('Minimizar')

    expect(onAviso).not.toHaveBeenCalledWith('info', expect.stringContaining('alejaste'))
})

it('la barra flotante pasa a rojo mientras el vendedor está alejado', async () => {
    const clienteConCoords = { ...cliente, latitud: -34.6, longitud: -58.4 }
    mockGeolocacionEnVivoAlejado({ latitude: -34.61, longitude: -58.41, accuracy: 5 })
    renderFlow({
        otroCliente,
        cliente: { ...clienteConCoords, estado: 'en_curso', visitaId: 55 },
    })
    await screen.findByLabelText('Minimizar')
    fireEvent.click(screen.getByRole('button', { name: /kiosco sur/i }))

    expect(await screen.findByText(/te alejaste de almacen don jose/i)).toBeInTheDocument()
})
