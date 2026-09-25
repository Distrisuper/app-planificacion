import { useState } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
const authMock = vi.fn(() => ({
    capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authMock() }))
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
    observaciones: null,
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
    onDatosComercio?: (c: IAgendaClient) => void
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
    onDatosComercio,
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
            {/* Simula lo que hace el efecto de reconciliación de AgendaSemanaPage cuando el
                refetch de la agenda no encuentra la card en curso: suelta el puntero. Es el
                parpadeo de estado DERIVADO que reabría el mapa del alta sobre una visita ya
                iniciada. */}
            <button onClick={() => setVisitaEnCurso(null)}>Soltar visita en curso</button>
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
                onDatosComercio={onDatosComercio}
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

const ESQUEMA_ALTA_COMPLETO = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true, obligatorio: true },
        { clave: 'referencias', etiqueta: 'Referencias comerciales', seccion: 'identidad', tipo: 'textoLargo', max: 300 },
    ],
    catalogos: {},
}

function renderFlow(
    over: {
        cliente?: IAgendaClient
        otroCliente?: IAgendaClient
        directoAMapa?: boolean
    } = {},
) {
    const onDatosComercio = vi.fn()
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
                onDatosComercio={onDatosComercio}
            />
        </QueryClientProvider>,
    )
    return { onGeoBloqueada, onClose, onAviso, onVisitaIniciada, onVisitaCerrada, onDatosComercio }
}

/** El catálogo de "Datos del comercio" tal cual lo manda la API. Acá va el mínimo con el
 *  que los tests del gate completan el formulario. */
const CATALOGO_FICHA = [
    {
        campo: 'especialidad', descripcion: 'Especialidad', tipo: 'opcion', multiple: true,
        obligatorio: true, orden: 1, minimo: null, maximo: null,
        opciones: [{ codigo: 'frenos', label: 'Frenos' }, { codigo: 'monomarca', label: 'Monomarca' }],
    },
    {
        campo: 'monomarca_marca', descripcion: '¿De qué marca?', tipo: 'opcion', multiple: false,
        obligatorio: false, orden: 2, minimo: 1, maximo: 60,
        opciones: [{ codigo: 'ford', label: 'Ford' }, { codigo: 'otros', label: 'Otros', abierta: true }],
    },
    {
        campo: 'personas', descripcion: 'Personas que trabajan', tipo: 'entero', multiple: false,
        obligatorio: true, orden: 3, minimo: 1, maximo: 999, opciones: null,
    },
    {
        campo: 'facturacion', descripcion: 'Facturación mensual', tipo: 'opcion', multiple: false,
        obligatorio: true, orden: 4, minimo: null, maximo: null,
        opciones: [
            { codigo: '5', label: 'Menor a 10M', labelCorto: '<10M' },
            { codigo: '3', label: 'Mayor a 30M', labelCorto: '+30M' },
        ],
    },
]

beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [] })
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 99, ofrecimientos: 3 })
    ;(api.actualizarFicha as any).mockResolvedValue({ pendientes: [], valores: {} })
    // El sheet de la ficha dibuja desde el catálogo (GET /ficha/campos): sin esto no hay
    // controles y el gate no se puede completar en ningún test.
    ;(api.getCamposFicha as any).mockResolvedValue(CATALOGO_FICHA)
    // Esquema de "Datos para el alta" con sólo el nombre obligatorio: cae al nombre de la
    // card, así que los tests de alta que no son sobre ese gate no quedan trabados en él.
    ;(api.getEsquemaAlta as any).mockResolvedValue(ESQUEMA_ALTA_COMPLETO)
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

it.each(['VISITA_NOT_FOUND', 'VISITA_AJENA'])(
    'si cerrar falla con %s (la visita ya no existe para este vendedor), suelta la visita en curso',
    async code => {
        // Pasa tras "Reiniciar" en modo prueba: el backend borra las resoluciones, pero el
        // puntero local seguía apuntando a una visita que ya no existe — y la barra
        // "Visitando a…" quedaba trabada, sin forma de cerrarla.
        ;(api.cerrarVisita as any).mockRejectedValue({ response: { data: { code } } })
        const clienteEnCurso = { ...cliente, estado: 'en_curso' as const, visitaId: 55 }
        const { onClose, onAviso, onVisitaCerrada } = renderFlow({ cliente: clienteEnCurso })
        localStorage.setItem('visita-en-curso', JSON.stringify({ cliente: clienteEnCurso, visitaId: 55 }))
        fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(onVisitaCerrada).toHaveBeenCalled()
        expect(leerVisitaEnCurso()).toBeNull()
        expect(onAviso).toHaveBeenCalledWith('info', expect.stringMatching(/ya no existe/i))
    },
)

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

it('un cliente nuevo abre el mapa para ubicar el comercio y manda ese pin como coordCliente', async () => {
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        latitud: undefined,
        longitud: undefined,
    }
    // El watch en vivo del mapa es el que planta el pin del comercio (modo 'ubicar'):
    // sin pin previo, el primer fix propio ES la ubicación de partida.
    mockGeolocacionEnVivo({ latitude: -34.62, longitude: -58.42, accuracy: 8 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: true, coord: '-34.6,-58.4', precisionM: 10 })
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 77, ofrecimientos: 0 })
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    const { onVisitaIniciada } = renderFlow({ cliente: clienteAlta, directoAMapa: true })

    // El mapa aparece solo (no hay propuesta que confirmar antes) y nada se inició todavía.
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.getPropuesta).not.toHaveBeenCalled()
    expect(api.iniciarVisita).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith({
            rotacionClienteId: 42,
            coordInicio: '-34.6,-58.4',
            // El pin que puso el GPS: la única ubicación que va a tener este comercio.
            coordCliente: '-34.62000000,-58.42000000',
            propuesta: [],
        }),
    )
    await waitFor(() => expect(onVisitaIniciada).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'alta' }), 77))
})

it('el mapa del cliente nuevo no bloquea por distancia: no hay coordenada previa contra la cual medir', async () => {
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        latitud: undefined,
        longitud: undefined,
    }
    mockGeolocacionEnVivo({ latitude: -34.62, longitude: -58.42, accuracy: 8 })
    renderFlow({ cliente: clienteAlta, directoAMapa: true })

    await screen.findByTestId('mapa-iniciar-visita')
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeEnabled()
    // El texto de distancia es de los clientes reales: acá el pin y el vendedor son el
    // mismo punto hasta que él lo mueva.
    expect(screen.queryByText(/del cliente/i)).not.toBeInTheDocument()
})

it('el cliente nuevo no muestra el código sintético #ALTA-000009 en el sheet', async () => {
    // Finding #2 de la revisión final: `identidadCliente` arma `#${codigoParticularCliente}`,
    // y ese código sintético es vocabulario que el vendedor nunca tiene que ver.
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        estado: 'en_curso',
        visitaId: 77,
        latitud: undefined,
        longitud: undefined,
    }
    renderFlow({ cliente: clienteAlta })
    await screen.findByText(clienteAlta.nombreCliente)
    expect(screen.queryByText(/ALTA-000009/)).not.toBeInTheDocument()
})

it('con el GPS caído el cliente nuevo igual puede iniciar, y la visita queda sin ubicación', async () => {
    // El overlay "Iniciando visita…" que trababa al vendedor (finding #1 de la revisión
    // final) ya no existe: ahora el paso es el mapa, que tiene su propia salida y avisa
    // qué se pierde. Sin fix nunca hay pin, así que no viaja coordCliente.
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        latitud: undefined,
        longitud: undefined,
    }
    const watchPosition = vi.fn((_ok: any, err: any) => {
        err({ code: 1 })
        return 1
    })
    vi.stubGlobal('navigator', {
        geolocation: { watchPosition, getCurrentPosition: vi.fn(), clearWatch: vi.fn() },
    })
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: true, coord: '-34.6,-58.4', precisionM: 10 })
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 77, ofrecimientos: 0 })
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    renderFlow({ cliente: clienteAlta, directoAMapa: true })

    await screen.findByText(/sin la ubicación del comercio/i)
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    await waitFor(() =>
        expect(api.iniciarVisita).toHaveBeenCalledWith(
            expect.objectContaining({ rotacionClienteId: 42, coordCliente: undefined }),
        ),
    )
})

it('una vez iniciada la visita del alta, el mapa no vuelve aunque se suelte el puntero de visita en curso', async () => {
    // El bug real: el mapa del alta colgaba de `mostrarRubros`, estado DERIVADO de
    // `visitaEnCurso` + la card refetcheada. Cuando el efecto de reconciliación de la
    // página soltaba ese puntero, el mapa reaparecía sobre una visita YA iniciada y el
    // siguiente "Iniciar visita" rebotaba con 409 VISITA_ACTIVA_EXISTENTE.
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        latitud: undefined,
        longitud: undefined,
    }
    mockGeolocacionEnVivo({ latitude: -34.62, longitude: -58.42, accuracy: 8 })
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 77, ofrecimientos: 0 })
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    renderFlow({ cliente: clienteAlta, directoAMapa: true })

    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
    await waitFor(() =>
        expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument(),
    )

    // La card sigue diciendo 'pendiente' (el refetch todavía no llegó) y encima se suelta
    // el puntero: con eso alcanzaba para que el mapa volviera.
    fireEvent.click(screen.getByRole('button', { name: /soltar visita en curso/i }))
    await new Promise(r => setTimeout(r, 100))
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
    expect(api.iniciarVisita).toHaveBeenCalledTimes(1)
})

it('el mapa del cliente nuevo se puede cancelar y vuelve a la agenda', async () => {
    const clienteAlta: IAgendaClient = {
        ...cliente,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
        latitud: undefined,
        longitud: undefined,
    }
    mockGeolocacionEnVivo({ latitude: -34.62, longitude: -58.42, accuracy: 8 })
    const { onClose } = renderFlow({ cliente: clienteAlta, directoAMapa: true })

    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByLabelText('Cancelar'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
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
    observaciones: null,
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

it('en modo prueba el aviso de corrección dice que no se guarda de forma permanente', async () => {
    authMock.mockReturnValue({ capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true } })
    ;(api.iniciarVisita as any).mockResolvedValue({
        visitaId: 99,
        ofrecimientos: 0,
        correccionPermanenteAplicada: false,
    })
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
            'En modo prueba la corrección no se guarda de forma permanente.',
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

describe('No visité con la visita ya abierta', () => {
    it('registra No visité y suelta la visita en curso', async () => {
        ;(api.noVisitaSobreVisitaAbierta as any).mockResolvedValue({ rotacionClienteId: 42 })
        ;(api.getMotivos as any).mockImplementation((nivel: string) =>
            Promise.resolve(
                nivel === 'visita'
                    ? [{ motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] }]
                    : [],
            ),
        )
        const { onVisitaCerrada } = renderFlow({
            cliente: { ...cliente, estado: 'en_curso', visitaId: 7 },
        })

        fireEvent.click(await screen.findByText('No visité'))
        fireEvent.click(await screen.findByText('Cerrado'))
        // Dos sheets apiladas comparten el mismo texto de botón (el de VisitaSheet
        // sigue montado detrás): el de ResolucionSheet es el último en el DOM.
        fireEvent.click(screen.getAllByText('Cerrar visita').at(-1)!)

        await waitFor(() =>
            expect(api.noVisitaSobreVisitaAbierta).toHaveBeenCalledWith(7, [1]),
        )
        await waitFor(() => expect(onVisitaCerrada).toHaveBeenCalled())
        expect(leerVisitaEnCurso()).toBeNull()
    })

    it('avisa que los rubros cargados no van a contar', async () => {
        ;(api.getMotivos as any).mockImplementation((nivel: string) =>
            Promise.resolve(
                nivel === 'visita'
                    ? [{ motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] }]
                    : [],
            ),
        )
        ;(api.getOfrecimientos as any).mockResolvedValue([
            {
                id: 8, resolucionId: 7, tipo: 'rubro', codigo: 'FILT', descripcion: 'Filtros',
                gapUnits: null, esPropuesto: false, resuelto: true,
                motivos: [{ motivoId: 10, valores: {} }], alcance: [],
            },
        ])
        renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 7 } })

        // Esperar a que los ofrecimientos hayan cargado: si se clickea antes, `completos`
        // todavía es 0 (el mismo gap que ya advierte el comentario de `ofrecimientosCargados`
        // en VisitaSheet).
        await screen.findByText('Filtros')
        fireEvent.click(screen.getByText('No visité'))

        expect(await screen.findByText(/Cargaste 1 rubro/)).toBeInTheDocument()
    })

    it('una visita que ya no existe (VISITA_NOT_FOUND) suelta la visita en curso', async () => {
        ;(api.noVisitaSobreVisitaAbierta as any).mockRejectedValue({
            response: { data: { code: 'VISITA_NOT_FOUND' } },
        })
        ;(api.getMotivos as any).mockImplementation((nivel: string) =>
            Promise.resolve(
                nivel === 'visita'
                    ? [{ motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] }]
                    : [],
            ),
        )
        const clienteEnCurso = { ...cliente, estado: 'en_curso' as const, visitaId: 7 }
        const { onAviso, onVisitaCerrada } = renderFlow({ cliente: clienteEnCurso })
        localStorage.setItem('visita-en-curso', JSON.stringify({ cliente: clienteEnCurso, visitaId: 7 }))

        fireEvent.click(await screen.findByText('No visité'))
        fireEvent.click(await screen.findByText('Cerrado'))
        fireEvent.click(screen.getAllByText('Cerrar visita').at(-1)!)

        await waitFor(() =>
            expect(onAviso).toHaveBeenCalledWith('info', expect.stringMatching(/ya no existe/i)),
        )
        expect(onVisitaCerrada).toHaveBeenCalled()
        expect(leerVisitaEnCurso()).toBeNull()
    })

    it('un cliente ya resuelto en el servidor cierra el flujo con aviso informativo', async () => {
        ;(api.noVisitaSobreVisitaAbierta as any).mockRejectedValue({
            response: { data: { code: 'VISITA_YA_CERRADA' } },
        })
        ;(api.getMotivos as any).mockImplementation((nivel: string) =>
            Promise.resolve(
                nivel === 'visita'
                    ? [{ motivoId: 1, nivel: 'visita', descripcion: 'Cerrado', resultado: null, codigo: null, campos: [] }]
                    : [],
            ),
        )
        const { onAviso } = renderFlow({
            cliente: { ...cliente, estado: 'en_curso', visitaId: 7 },
        })

        fireEvent.click(await screen.findByText('No visité'))
        fireEvent.click(await screen.findByText('Cerrado'))
        // Dos sheets apiladas comparten el mismo texto de botón (el de VisitaSheet
        // sigue montado detrás): el de ResolucionSheet es el último en el DOM.
        fireEvent.click(screen.getAllByText('Cerrar visita').at(-1)!)

        await waitFor(() =>
            expect(onAviso).toHaveBeenCalledWith('info', expect.stringMatching(/ya estaba resuelto/i)),
        )
    })
})

describe('identidad del cliente en el header', () => {
    it('muestra código y razón social bajo el cartel', async () => {
        renderFlow({
            cliente: { ...cliente, nombreFantasia: 'AUTOPIEZAS DERQUI' },
        })
        // El título sigue siendo el cartel: es lo que el vendedor ve en la puerta.
        expect(await screen.findByText('AUTOPIEZAS DERQUI')).toBeInTheDocument()
        expect(screen.getByText('#10034 · ALMACEN DON JOSE')).toBeInTheDocument()
    })

    it('sin cartel deja solo el código: el título ya es la razón social', async () => {
        renderFlow()
        expect(await screen.findByText('ALMACEN DON JOSE')).toBeInTheDocument()
        expect(screen.getByText('#10034')).toBeInTheDocument()
    })
})

describe('gate de "Datos del comercio"', () => {
    const conPendientes: IAgendaClient = {
        ...cliente,
        ficha: { pendientes: ['especialidad', 'personas', 'facturacion'], valores: {} },
    }
    /** Espera a que el catálogo llegue: el sheet dibuja los controles recién con él, así que
     *  el eyebrow "Datos del comercio" puede estar en pantalla con el cuerpo todavía en
     *  spinner. */
    async function completarFicha() {
        fireEvent.click(await screen.findByRole('button', { name: /^frenos$/i }))
        fireEvent.change(screen.getByRole('textbox', { name: /personas que trabajan/i }), { target: { value: '4' } })
        fireEvent.click(screen.getByRole('radio', { name: /mayor a 30m/i }))
    }

    it('sin pendientes no aparece y la visita arranca directo', async () => {
        renderFlow({ cliente: { ...cliente, ficha: { pendientes: [], valores: {} } } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
        // La visita ya arrancada ofrece el chip de edición (Task 13) — lo que no puede
        // aparecer acá es el SHEET del gate (su botón "Guardar"/"Iniciar visita" propio).
        expect(screen.queryByRole('button', { name: /^guardar$/i })).not.toBeInTheDocument()
        expect(api.actualizarFicha).not.toHaveBeenCalled()
    })

    it('con pendientes intercepta ANTES del POST (camino sin coordenadas)', async () => {
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        expect(await screen.findByText(/datos del comercio/i)).toBeInTheDocument()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(geo.capturarUbicacion).not.toHaveBeenCalled()
    })

    it('confirmar hace el PUT y DESPUÉS el POST, en ese orden, sin volver a pedir la ficha', async () => {
        const orden: string[] = []
        ;(api.actualizarFicha as any).mockImplementation(async () => { orden.push('ficha'); return { pendientes: [], valores: {} } })
        ;(api.iniciarVisita as any).mockImplementation(async () => { orden.push('visita'); return { visitaId: 99, ofrecimientos: 3 } })
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        await completarFicha()
        // Dentro del sheet el botón también dice "Iniciar visita": tomar el habilitado.
        const botones = screen.getAllByRole('button', { name: /iniciar visita/i })
        fireEvent.click(botones[botones.length - 1])
        await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
        expect(api.actualizarFicha).toHaveBeenCalledWith('10034', {
            especialidad: ['frenos'], personas: ['4'], facturacion: ['3'],
        })
        expect(orden).toEqual(['ficha', 'visita'])
        expect(api.actualizarFicha).toHaveBeenCalledTimes(1)
    })

    it('si el PUT falla, muestra el error en el sheet y la visita NO arranca', async () => {
        ;(api.actualizarFicha as any).mockRejectedValue(new Error('500'))
        renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        await completarFicha()
        const botones = screen.getAllByRole('button', { name: /iniciar visita/i })
        fireEvent.click(botones[botones.length - 1])
        expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos guardar/i)
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(screen.getByText(/datos del comercio/i)).toBeInTheDocument()
    })

    it('cerrar sin cargar no hace PUT ni POST y cierra el flujo entero', async () => {
        const { onClose } = renderFlow({ cliente: conPendientes })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        await screen.findByText(/datos del comercio/i)
        // PropuestaSheet, atrás, también expone su propio "Cerrar": el de la ficha es el
        // último montado (PerfilComercioSheet se renderiza al final de VisitaFlow).
        const cerrarBotones = screen.getAllByRole('button', { name: /cerrar/i })
        fireEvent.click(cerrarBotones[cerrarBotones.length - 1])
        await waitFor(() => expect(screen.queryByText(/datos del comercio/i)).not.toBeInTheDocument())
        expect(api.actualizarFicha).not.toHaveBeenCalled()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        // Cerrar el formulario cierra la card: no hay medio estado del que salir.
        expect(onClose).toHaveBeenCalled()
    })

    it('con coordenadas del cliente, el gate corta ANTES del mapa', async () => {
        mockGeolocacionEnVivo({ latitude: -34.6, longitude: -58.4, accuracy: 10 })
        renderFlow({ cliente: { ...conPendientes, latitud: -34.6, longitud: -58.4 } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        expect(await screen.findByText(/datos del comercio/i)).toBeInTheDocument()
        expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()

        await completarFicha()
        const botones = screen.getAllByRole('button', { name: /iniciar visita/i })
        fireEvent.click(botones[botones.length - 1])

        // Confirmar la ficha abre el MAPA, no la visita: el vendedor todavía tiene que
        // confirmar la cercanía. "Iniciar visita" del mapa vuelve a significar iniciar.
        expect(await screen.findByTestId('mapa-iniciar-visita')).toBeInTheDocument()
        await waitFor(() => expect(api.actualizarFicha).toHaveBeenCalledTimes(1))
        expect(api.iniciarVisita).not.toHaveBeenCalled()

        const iniciarEnMapa = screen.getByRole('button', { name: /^iniciar visita$/i })
        await waitFor(() => expect(iniciarEnMapa).toBeEnabled())
        fireEvent.click(iniciarEnMapa)
        // Y no vuelve a pedir la ficha: el gate ya quedó destrabado para este cliente.
        await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
        expect(api.actualizarFicha).toHaveBeenCalledTimes(1)
    })

    it('"Iniciar visita" directo desde la card también corta antes del mapa', async () => {
        mockGeolocacionEnVivo({ latitude: -34.6, longitude: -58.4, accuracy: 10 })
        renderFlow({
            cliente: { ...conPendientes, latitud: -34.6, longitud: -58.4 },
            directoAMapa: true,
        })
        expect(await screen.findByText(/datos del comercio/i)).toBeInTheDocument()
        expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
    })

    it('en el camino directo, cerrar la ficha vuelve a la agenda y no la reabre sola', async () => {
        // `cargandoDirecto` sigue habilitado mientras `propuestaPendiente` es null, así que
        // limpiar sólo el estado del sheet dejaría que el efecto lo reabra con la propuesta
        // cacheada: el vendedor no podía salir. Mismo caso que el `onCancel` del mapa.
        const { onClose } = renderFlow({
            cliente: { ...conPendientes, latitud: -34.6, longitud: -58.4 },
            directoAMapa: true,
        })
        await screen.findByText(/datos del comercio/i)
        const cerrarBotones = screen.getAllByRole('button', { name: /cerrar/i })
        fireEvent.click(cerrarBotones[cerrarBotones.length - 1])
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        await new Promise(r => setTimeout(r, 150))
        expect(screen.queryByText(/datos del comercio/i)).not.toBeInTheDocument()
        expect(api.iniciarVisita).not.toHaveBeenCalled()
    })

    it('pide sólo el campo pendiente', async () => {
        renderFlow({ cliente: { ...cliente, ficha: { pendientes: ['facturacion'], valores: { especialidad: ['frenos'], personas: ['2'] } } } })
        fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))
        // El botón aparece recién con el catálogo: hasta entonces no hay nada que dibujar.
        expect(await screen.findByRole('button', { name: /falta: facturación mensual/i })).toBeDisabled()
        expect(screen.queryByRole('textbox', { name: /personas que trabajan/i })).not.toBeInTheDocument()
    })

    it('con la ficha completa, VisitaSheet ofrece "Datos del comercio" y editar hace el PUT con todos los campos, sin tocar la visita', async () => {
        const completo: IAgendaClient = {
            ...cliente, estado: 'en_curso', visitaId: 77,
            ficha: { pendientes: [], valores: { especialidad: ['frenos'], personas: ['2'], facturacion: ['5'] } },
        }
        renderFlow({ cliente: completo })
        fireEvent.click(await screen.findByRole('button', { name: /datos del comercio/i }))
        // Precargado y en modo edición.
        expect(await screen.findByRole('button', { name: /^guardar$/i })).toBeEnabled()
        expect(screen.getByRole('textbox', { name: /personas que trabajan/i })).toHaveValue('2')
        fireEvent.change(screen.getByRole('textbox', { name: /personas que trabajan/i }), { target: { value: '3' } })
        fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
        await waitFor(() => expect(api.actualizarFicha).toHaveBeenCalledWith('10034', {
            especialidad: ['frenos'], personas: ['3'], facturacion: ['5'],
        }))
        await waitFor(() => expect(screen.queryByRole('button', { name: /^guardar$/i })).not.toBeInTheDocument())
        expect(api.iniciarVisita).not.toHaveBeenCalled()
        expect(api.cerrarVisita).not.toHaveBeenCalled()
    })

    describe('visita de alta: la ficha se pide ADENTRO de la visita, no antes', () => {
        // Del prospecto no se sabe nada antes de entrar: pedir la ficha antes de iniciar lo
        // frena en la puerta. Se carga con la visita abierta y es condición para cerrarla.
        const altaPendiente: IAgendaClient = {
            ...conPendientes,
            tipo: 'alta',
            codigoParticularCliente: 'ALTA-000009',
            latitud: undefined,
            longitud: undefined,
        }
        const altaEnCurso: IAgendaClient = { ...altaPendiente, estado: 'en_curso', visitaId: 77 }

        it('iniciar la visita de alta con la ficha pendiente NO muestra el gate', async () => {
            mockGeolocacionEnVivo({ latitude: -34.62, longitude: -58.42, accuracy: 8 })
            ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: true, coord: '-34.6,-58.4', precisionM: 10 })
            ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 77, ofrecimientos: 0 })
            renderFlow({ cliente: altaPendiente, directoAMapa: true })
            await screen.findByTestId('mapa-iniciar-visita')
            fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
            await waitFor(() => expect(api.iniciarVisita).toHaveBeenCalledTimes(1))
            expect(api.actualizarFicha).not.toHaveBeenCalled()
            expect(screen.queryByText(/se carga una sola vez/i)).not.toBeInTheDocument()
        })

        it('"Datos para el alta" abre el relevamiento aunque falte la ficha: cada renglón abre lo suyo', async () => {
            const { onDatosComercio } = renderFlow({ cliente: altaEnCurso })
            fireEvent.click(await screen.findByRole('button', { name: /datos para el alta/i }))
            expect(onDatosComercio).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
            expect(screen.queryByRole('button', { name: /^frenos$/i })).not.toBeInTheDocument()
        })

        it('el renglón de la ficha pendiente la guarda en ALTA-… y no abre el relevamiento', async () => {
            const { onDatosComercio } = renderFlow({ cliente: altaEnCurso })
            fireEvent.click(await screen.findByRole('button', { name: /ficha del comercio/i }))
            await completarFicha()
            fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
            await waitFor(() => expect(api.actualizarFicha).toHaveBeenCalledWith('ALTA-000009', {
                especialidad: ['frenos'], personas: ['4'], facturacion: ['3'],
            }))
            await waitFor(() => expect(screen.getByRole('button', { name: /ficha del comercio/i })).toHaveTextContent(/completa/i))
            expect(onDatosComercio).not.toHaveBeenCalled()
        })

        it('reabrir la ficha recién guardada la muestra cargada, no vacía', async () => {
            // El `cliente` de la visita abierta es una foto previa al PUT: sin tomar lo que
            // devuelve, la edición se precargaba vacía y "Guardar" quedaba deshabilitado.
            const valores = { especialidad: ['frenos'], personas: ['4'], facturacion: ['3'] }
            ;(api.actualizarFicha as any).mockResolvedValue({ pendientes: [], valores })
            renderFlow({ cliente: altaEnCurso })
            fireEvent.click(await screen.findByRole('button', { name: /ficha del comercio/i }))
            await completarFicha()
            fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
            await waitFor(() => expect(screen.getByRole('button', { name: /ficha del comercio/i })).toHaveTextContent(/completa/i))
            fireEvent.click(screen.getByRole('button', { name: /ficha del comercio/i }))
            expect(await screen.findByRole('button', { name: /^guardar$/i })).toBeEnabled()
        })

        it('sin la ficha no se cierra: el botón la pide, y guardada habilita el cierre', async () => {
            const { onDatosComercio } = renderFlow({ cliente: altaEnCurso })
            fireEvent.change(await screen.findByRole('textbox', { name: /observaciones/i }), {
                target: { value: 'Local con buena rotación' },
            })
            expect(screen.queryByRole('button', { name: /^cerrar visita$/i })).not.toBeInTheDocument()
            fireEvent.click(screen.getByRole('button', { name: /falta la ficha del comercio/i }))
            await completarFicha()
            fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
            expect(await screen.findByRole('button', { name: /^cerrar visita$/i })).toBeEnabled()
            // Desde el cierre no se desvía al relevamiento: el vendedor venía a cerrar.
            expect(onDatosComercio).not.toHaveBeenCalled()
            expect(api.cerrarVisita).not.toHaveBeenCalled()
        })

        it('con la ficha completa pero faltando obligatorios del alta, el pie abre el relevamiento en vez de cerrar', async () => {
            ;(api.getEsquemaAlta as any).mockResolvedValue({
                ...ESQUEMA_ALTA_COMPLETO,
                campos: [
                    ...ESQUEMA_ALTA_COMPLETO.campos,
                    { clave: 'cuit', etiqueta: 'CUIT', seccion: 'identidad', tipo: 'cuit', max: 13, obligatorio: true },
                ],
            })
            const { onDatosComercio } = renderFlow({
                cliente: { ...altaEnCurso, ficha: { pendientes: [], valores: { especialidad: ['frenos'], personas: ['2'], facturacion: ['5'] } } },
            })
            fireEvent.change(await screen.findByRole('textbox', { name: /observaciones/i }), {
                target: { value: 'Local con buena rotación' },
            })
            expect(await screen.findByRole('button', { name: /^datos para el alta/i })).toHaveTextContent(/falta 1 · obligatorios/i)
            fireEvent.click(screen.getByRole('button', { name: /faltan datos para el alta/i }))
            expect(onDatosComercio).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
            expect(api.cerrarVisita).not.toHaveBeenCalled()
        })

        it('con la ficha completa, su renglón abre la edición y el header no suma el chip de master', async () => {
            renderFlow({
                cliente: { ...altaEnCurso, ficha: { pendientes: [], valores: { especialidad: ['frenos'], personas: ['2'], facturacion: ['5'] } } },
            })
            fireEvent.click(await screen.findByRole('button', { name: /ficha del comercio/i }))
            expect(await screen.findByRole('button', { name: /^guardar$/i })).toBeEnabled()
            expect(screen.getByRole('textbox', { name: /personas que trabajan/i })).toHaveValue('2')
            expect(screen.queryByRole('button', { name: /^datos del comercio$/i })).not.toBeInTheDocument()
        })

        it('cerrar la ficha sin guardar deja la visita abierta', async () => {
            const { onClose } = renderFlow({ cliente: altaEnCurso })
            fireEvent.click(await screen.findByRole('button', { name: /ficha del comercio/i }))
            await screen.findByRole('button', { name: /^frenos$/i })
            const cerrar = screen.getAllByRole('button', { name: /cerrar/i })
            fireEvent.click(cerrar[cerrar.length - 1])
            await waitFor(() => expect(screen.queryByRole('button', { name: /^frenos$/i })).not.toBeInTheDocument())
            expect(onClose).not.toHaveBeenCalled()
            expect(screen.getByRole('button', { name: /falta la ficha del comercio/i })).toBeInTheDocument()
        })
    })

    it('con pendientes, VisitaSheet NO ofrece el chip (la puerta es el gate)', async () => {
        renderFlow({ cliente: { ...conPendientes, estado: 'en_curso', visitaId: 77 } })
        await screen.findByRole('button', { name: /cerrar visita/i })
        expect(screen.queryByRole('button', { name: /datos del comercio/i })).not.toBeInTheDocument()
    })
})

/** Cliente con coordenada: es lo que habilita medir al cerrar. El fixture base no la
 *  tiene, y por eso los tests de cierre que ya existían no pasan nunca por el desvío. */
const clienteConCoords: IAgendaClient = {
    ...cliente,
    estado: 'en_curso',
    visitaId: 55,
    latitud: -34.6,
    longitud: -58.4,
}

it('cerrar lejos del cliente no cierra: desvía al mapa', async () => {
    // El vendedor está a ~1112 m con un fix preciso: evidencia positiva de lejanía.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})

it('cerrar cerca del cliente cierra directo, sin mapa', async () => {
    // Mismo punto que el cliente: no hay nada que mostrar.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('desvía aunque el aviso de alejado esté apagado por un fix viejo', async () => {
    // EL CASO QUE MOTIVA LA FEATURE. El watch del hook nunca corrió (jsdom no expone
    // geolocation acá), así que `alejado` es false: el estado congelado del background.
    // La coordenada definitiva igual tiene que mandar al mapa.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})

it('un fix demasiado impreciso no desvía: ante la duda no interrumpe', async () => {
    // 1112 m de distancia pero 2000 m de precisión: no prueba lejanía. Es el agujero
    // conocido y aceptado del spec — no convertirlo en desvío sin cambiar el spec.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 2000,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('un cliente sin coordenadas cierra directo: no hay contra qué medir', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: { ...cliente, estado: 'en_curso', visitaId: 55 } })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalled())
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('cancelar el mapa de cierre no cierra la visita, y volver a tocar vuelve a medir', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument())
    expect(api.cerrarVisita).not.toHaveBeenCalled()

    // Segundo intento: mide de nuevo, y como se acercó, cierra derecho.
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.6,-58.4',
        precisionM: 10,
    })
    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() =>
        expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.6,-58.4' }),
    )
})

it('con el permiso denegado no cierra ni abre el mapa', async () => {
    ;(geo.capturarUbicacion as any).mockResolvedValue({ ok: false, motivo: 'denegado' })
    const { onGeoBloqueada } = renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await waitFor(() => expect(onGeoBloqueada).toHaveBeenCalledWith('denegado'))
    expect(api.cerrarVisita).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
})

it('cerrar igual desde el mapa exige confirmar, y confirmar cierra una sola vez', async () => {
    // El watch en vivo confirma la lejanía, así que el hook enciende `alejado` y el CTA
    // sale en su cara de "Cerrar igual".
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))

    // El diálogo se interpone: todavía no se escribió nada.
    await screen.findByText('¿Cerrar la visita lejos del cliente?')
    expect(api.cerrarVisita).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^cerrar igual$/i }))
    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalledTimes(1))
    expect(api.cerrarVisita).toHaveBeenCalledWith(55, { coordFinal: '-34.61,-58.4' })
})

// Este test usa `within`: agregarlo al import de '@testing-library/react' de la cabecera.
it('cancelar la confirmación deja la visita abierta y el mapa a la vista', async () => {
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))
    // `within` el diálogo y no `screen`: la X del mapa también tiene aria-label "Cancelar",
    // así que con el diálogo abierto hay DOS botones con ese nombre accesible y una query
    // global tira "found multiple elements".
    const dialogo = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() =>
        expect(screen.queryByText('¿Cerrar la visita lejos del cliente?')).not.toBeInTheDocument(),
    )
    expect(api.cerrarVisita).not.toHaveBeenCalled()
    // El mapa sigue ahí: cancelar la confirmación no es cancelar el desvío.
    expect(screen.getByTestId('mapa-iniciar-visita')).toBeInTheDocument()
})

it('si el GPS del mapa lo ubica en el cliente, el CTA cierra sin confirmación', async () => {
    // Llegó al mapa por una medición lejana, pero el watch de alta precisión del mapa
    // lo ubica en el local: el hook apaga `alejado` y el desacuerdo se resolvió a su favor.
    mockGeolocacionEnVivo({ latitude: -34.6, longitude: -58.4, accuracy: 5 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    await screen.findByTestId('mapa-iniciar-visita')

    // Esperar a que el CTA pase a verde, y NO `findAllByRole(/^cerrar visita$/)`: esa
    // query resuelve apenas hay UN match, y el botón del sheet de atrás siempre matchea
    // — devolvía ese, el click reabría el desvío y nunca se cerraba nada. La señal real
    // es que "Cerrar igual" desaparezca: el fix de alta precisión del mapa apagó el aviso.
    await waitFor(() =>
        expect(screen.queryByRole('button', { name: /cerrar igual/i })).not.toBeInTheDocument(),
    )
    // Ahora sí hay dos "Cerrar visita": el del sheet y el CTA del mapa, que va después.
    const ctas = screen.getAllByRole('button', { name: /^cerrar visita$/i })
    expect(ctas).toHaveLength(2)
    fireEvent.click(ctas[ctas.length - 1])

    await waitFor(() => expect(api.cerrarVisita).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('¿Cerrar la visita lejos del cliente?')).not.toBeInTheDocument()
})

it('si el cierre falla desde el mapa, avisa y no marca la visita como cerrada', async () => {
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockRejectedValue(new Error('red caída'))
    const { onAviso, onVisitaCerrada } = renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))
    await screen.findByText('¿Cerrar la visita lejos del cliente?')
    fireEvent.click(screen.getByRole('button', { name: /^cerrar igual$/i }))

    await waitFor(() =>
        expect(onAviso).toHaveBeenCalledWith('error', 'No se pudo cerrar la visita. Volvé a intentar.'),
    )
    expect(onVisitaCerrada).not.toHaveBeenCalled()
    // El mapa y el diálogo se van: el vendedor vuelve al sheet, donde está el botón para
    // reintentar y donde el toast queda legible.
    await waitFor(() => expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument())
})

it('la visita de alta también se desvía al mapa, y ahí no se le muestra el código sintético', async () => {
    // El alta tiene coordenada y es de primera mano: el mapa 'ubicar' no le pega el fix
    // del GPS y listo — le ofrece "Marcar la ubicación" y le pide tocar el mapa donde está
    // el comercio. Esa marca vale tanto como la del warehouse, así que el desvío aplica
    // igual. Lo que NO puede aparecer es `#ALTA-000009`: el código sintético no es
    // vocabulario de vendedor, y el resto de su UI se lo esconde.
    const clienteAltaEnCurso: IAgendaClient = {
        ...clienteConCoords,
        tipo: 'alta',
        codigoParticularCliente: 'ALTA-000009',
    }
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    ;(api.cerrarVisita as any).mockResolvedValue({ visitaId: 55, ofrecimientosPendientes: 0 })
    renderFlow({ cliente: clienteAltaEnCurso })

    // El alta tiene su propio gate de cierre (`puedeCerrarAlta`): sin un ofrecimiento ni
    // una observación el botón ni siquiera dice "Cerrar visita".
    const campo = await screen.findByRole('textbox', { name: /observaciones/i })
    fireEvent.change(campo, { target: { value: 'Local con buena rotación' } })

    fireEvent.click(await screen.findByRole('button', { name: /^cerrar visita$/i }))
    await screen.findByTestId('mapa-iniciar-visita')
    expect(api.cerrarVisita).not.toHaveBeenCalled()
    expect(screen.queryByText(/ALTA-000009/)).not.toBeInTheDocument()
})

it('si la visita en curso se suelta con el mapa abierto, no queda el diálogo huérfano', async () => {
    // `sincronizar` al volver del background —justo el momento que esta feature persigue—
    // puede soltar el puntero de visita en curso. El mapa cuelga de él y desmonta; el
    // diálogo se renderiza aparte, así que sin la limpieza quedaba flotando sobre la
    // agenda preguntando por una visita que ya no está.
    mockGeolocacionEnVivo({ latitude: -34.61, longitude: -58.4, accuracy: 10 })
    ;(geo.capturarUbicacion as any).mockResolvedValue({
        ok: true,
        coord: '-34.61,-58.4',
        precisionM: 10,
    })
    renderFlow({ cliente: clienteConCoords })

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cerrar igual/i }))
    await screen.findByText('¿Cerrar la visita lejos del cliente?')

    // `getByText` y no `getByRole`: el AlertDialog de Radix marca `aria-hidden` todo lo
    // que queda afuera, así que el botón del harness ya no está en el árbol accesible.
    fireEvent.click(screen.getByText('Soltar visita en curso'))

    await waitFor(() =>
        expect(screen.queryByText('¿Cerrar la visita lejos del cliente?')).not.toBeInTheDocument(),
    )
    expect(screen.queryByTestId('mapa-iniciar-visita')).not.toBeInTheDocument()
    expect(api.cerrarVisita).not.toHaveBeenCalled()
})
