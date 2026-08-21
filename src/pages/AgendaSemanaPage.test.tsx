import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import AgendaSemanaPage from './AgendaSemanaPage'
import * as api from '@/api/planificacion'
import { getDiaDeHoy } from '@/lib/weekDates'

vi.mock('@/api/planificacion')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

// `descripcion: null` en todas a propósito: estos tests cubren el fallback al número
// ("Semana N"). El caso con nombre de zona ("Zárate · …") tiene su propio test.
const ZONAS = [1, 2, 3, 4].map(semana => ({ semana, descripcion: null }))

const CICLO_ACTUAL_ABIERTO = {
    ciclo: {
        id: 1,
        rotacionId: 10,
        codigoParticularVendedor: 'V 2',
        semana: 3,
        fechaLunes: '2026-08-10',
        fechaApertura: '2026-08-10T10:00:00Z',
        fechaCierre: null,
        estado: 'abierta' as const,
    },
    semanas: ZONAS,
    semanasPendientes: [3, 4],
}
const CICLO_ACTUAL_STANDBY = {
    ciclo: null,
    semanas: ZONAS,
    semanasPendientes: [3, 4],
}
/** Sin pendientes conocidos: fuerza la caída al primer elemento de `semanas` (no de
 *  `semanasPendientes`) — es el caso que exige el test de wrap sobre el set real. */
const CICLO_ACTUAL_STANDBY_SIN_PENDIENTES = {
    ciclo: null,
    semanas: ZONAS,
    semanasPendientes: [],
}

/** Lo que responde `GET /planificacion/ciclo/actual` cuando el vendedor no tiene ninguna
 *  rotación materializada: el controller arma `{ ciclo, ...contexto }` con `contexto` null,
 *  así que `semanas` y `semanasPendientes` ni viajan. */
const CICLO_ACTUAL_SIN_ROTACION = { ciclo: null }

const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }

const clienteLunes = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    rotacionClienteId: 42,
    dia: 1,
    estado: 'pendiente' as const,
    visitaId: null,
    ofrecimientosPendientes: 0,
    seguimiento: { estado: 'no_corresponde' as const, motivo: null, mensaje: null },
}

/** `url` permite arrancar en una posición concreta (?dia=/?semana=), que es de donde la
 *  página lee el día y la semana que se están mirando. */
function renderPage(url = '/') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = { current: null as unknown as ReturnType<typeof useLocation> }
    function EspiaURL() {
        router.current = useLocation()
        return null
    }
    render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[url]}>
                <AgendaSemanaPage />
                <EspiaURL />
            </MemoryRouter>
        </QueryClientProvider>,
    )
    return { urlActual: () => `${router.current.pathname}${router.current.search}` }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getMotivos as any).mockResolvedValue([])
    ;(api.getVisitaActiva as any).mockResolvedValue(null)
    ;(api.getAgendaSemana as any).mockResolvedValue(semanaVacia)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: null,
        descripcionSemanaCerrada: null,
        sinVisitar: [],
        ofrecimientosAutocompletados: 0,
        altas: [],
        bajas: [],
        rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({
        semana: 3, clientes: 39, omitidos: [], dias: semanaVacia,
    })
})

afterEach(() => {
    vi.useRealTimers()
})

/** Fija el reloj en un lunes real (mismo `fecha_lunes` que CICLO_ACTUAL_ABIERTO) para que
 *  `getDiaDeHoy()` devuelva LUN de forma determinística — sin esto, el snap-al-montar
 *  (con ciclo activo, aterrizás siempre en HOY) haría que estos tests cambiaran de
 *  resultado según qué día corra la suite. `shouldAdvanceTime` deja que `waitFor`/
 *  `findBy*` (que usan un setTimeout real para su polling) sigan andando. */
function fijarLunes() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 9, 0))
}

it('sin ciclo abierto no pide la agenda operable, usa el preview', async () => {
    // Ramificar sobre cicloActual.ciclo === null (un dato) en vez de sobre el 409 de la
    // agenda.
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    renderPage()

    await waitFor(() => expect(api.previewSemana).toHaveBeenCalled())
    expect(api.getAgendaSemana).not.toHaveBeenCalled()
})

it('sin ciclo abierto arranca en la primera semana pendiente', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.previewSemana as any).mockResolvedValue({
        semana: 3, clientes: 0, omitidos: [], dias: semanaVacia,
    })
    renderPage()
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(3))
})

// ── Problema de cuenta ──────────────────────────────────────────────────────────
// resolveSellerCode() en el backend lo usan ciclo/actual, sincronizar Y las acciones —
// no es exclusivo del viejo abrirCiclo. Sin este manejo, un usuario sin código de
// vendedor asociado se queda viendo "Cargando…" para siempre, sin ningún aviso.

it('un usuario sin código de vendedor resoluble recibe un mensaje de cuenta, no "Cargando…" infinito', async () => {
    ;(api.getCicloActual as any).mockRejectedValue({
        response: { data: { code: 'SELLER_CODE_UNRESOLVED' } },
    })
    renderPage()

    expect(await screen.findByText(/no tiene un código de vendedor asignado/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Cargando…$/)).not.toBeInTheDocument()
})

it('un usuario con más de un código de vendedor también recibe su propio mensaje de cuenta', async () => {
    ;(api.getCicloActual as any).mockRejectedValue({
        response: { data: { code: 'SELLER_CODE_AMBIGUOUS' } },
    })
    renderPage()

    expect(await screen.findByText(/más de un código de vendedor/i)).toBeInTheDocument()
})

// ── Posición (semana + día) en la URL ──────────────────────────────────────────
// Recargar la página volvía al lunes de la vuelta abierta y le hacía perder al vendedor
// dónde estaba. Ahora la posición vive en la URL, así que sobrevive la recarga.

it('sin ?dia arranca en HOY, no en LUN', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage()

    const hoy = getDiaDeHoy() ?? 'LUN'
    const tab = await screen.findByRole('button', { name: new RegExp(`^${hoy}`) })
    // El tab activo es el único con el fondo navy.
    expect(tab.className).toMatch(/bg-dsnavy/)
})

it('con ciclo activo, un ?dia= viejo de la URL se pisa por HOY al montar', async () => {
    // Antes ganaba la URL. Ahora, con una zona activa, aterrizás siempre ahí con el día
    // de hoy: la URL solo debe reflejar la navegación EN VIVO de esta sesión (las flechas,
    // los tabs de día), nunca sobrevivir intacta a un montaje nuevo con un valor de una
    // sesión anterior — era justo lo que dejaba al vendedor viendo una zona/día viejo
    // después de recargar. Reloj fijo en MIÉRCOLES (no LUN, no coincide con la fixture)
    // para que la URL (?dia=JUE) y "hoy" queden garantizado en desacuerdo — sin fijar el
    // reloj el test podía pasar por casualidad si la suite corría un jueves.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 12, 9, 0)) // 2026-08-12 es miércoles
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage('/?dia=JUE')

    const tab = await screen.findByRole('button', { name: /^MIE/ })
    expect(tab.className).toMatch(/bg-dsnavy/)
    expect(screen.queryByRole('button', { name: /^JUE/ })?.className).not.toMatch(/bg-dsnavy/)
})

it('un ?dia inválido no rompe: cae a hoy', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage('/?dia=BASURA')

    const hoy = getDiaDeHoy() ?? 'LUN'
    const tab = await screen.findByRole('button', { name: new RegExp(`^${hoy}`) })
    expect(tab.className).toMatch(/bg-dsnavy/)
})

it('elegir un día lo escribe en la URL', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    const { urlActual } = renderPage()
    await screen.findByRole('button', { name: /^MIE/ })

    fireEvent.click(screen.getByRole('button', { name: /^MIE/ }))

    await waitFor(() => expect(urlActual()).toContain('dia=MIE'))
})

it('con ciclo activo, una ?semana= vieja de la URL se pisa por la zona activa al montar', async () => {
    // Antes ganaba la URL y quedaba en preview de la 4. Ahora, con la 3 activa, aterriza
    // ahí siempre — la misma razón que el día: la URL es navegación en vivo de esta
    // sesión, no algo que deba sobrevivir a un montaje nuevo.
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage('/?semana=4')

    expect(await screen.findByText(/Semana 3/)).toBeInTheDocument()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())
    expect(api.previewSemana).not.toHaveBeenCalled()
})

it('una ?semana fuera de la rotación se ignora y vale la vuelta abierta', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage('/?semana=99')

    expect(await screen.findByText(/Semana 3/)).toBeInTheDocument()
    expect(api.previewSemana).not.toHaveBeenCalled()
})

it('una ?semana fuera del set real, sin ciclo abierto, cae al valor por defecto', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY) // semanas: [1,2,3,4]
    ;(api.previewSemana as any).mockResolvedValue({
        semana: 3, clientes: 0, omitidos: [], dias: semanaVacia,
    })
    renderPage('/?semana=7')

    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(3))
})

it('moverse de semana lo escribe en la URL', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    const { urlActual } = renderPage()
    await screen.findByText(/Semana 3/)

    fireEvent.click(screen.getByRole('button', { name: /zona siguiente/i }))

    await waitFor(() => expect(urlActual()).toContain('semana=4'))
})

it('sin ciclo activo, no escribe la URL al montar: / queda limpio', async () => {
    // Sin zona activa no hay nada que forzar todavía — sigue sin escribir nada hasta que
    // el vendedor navegue. El caso CON ciclo activo es al revés (test siguiente): ahí sí
    // se escribe siempre, que es justo lo que hace que un bookmark nunca congele nada.
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    const { urlActual } = renderPage()
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalled())

    expect(urlActual()).toBe('/')
})

it('con ciclo activo, escribe la zona y el día de hoy en la URL al montar', async () => {
    // Es lo que hace que recargar — o un bookmark tomado más tarde — nunca reproduzca una
    // navegación vieja: cada montaje con zona activa vuelve a pisar la URL con el
    // presente. Antes esto se lograba NO escribiendo nada; ahora se logra escribiendo
    // siempre lo mismo que ya se muestra.
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    const { urlActual } = renderPage()
    await screen.findByText(/Semana 3/)

    const hoy = getDiaDeHoy() ?? 'LUN'
    await waitFor(() => {
        const url = urlActual()
        expect(url).toContain('semana=3')
        expect(url).toContain(`dia=${hoy}`)
    })
})

it('las flechas hacen wrap sobre el set real de semanas, no sobre 5 fijo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY_SIN_PENDIENTES) // semanas: [1,2,3,4]
    ;(api.previewSemana as any).mockImplementation((s: number) =>
        Promise.resolve({ semana: s, clientes: 0, omitidos: [], dias: semanaVacia }),
    )
    renderPage()
    await screen.findByText(/semana 1/i) // arranca en la primera semana conocida
    fireEvent.click(screen.getByRole('button', { name: /zona anterior/i }))
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4)) // wrap 1 -> 4, no -> 0
})

it('sincroniza al montar y avisa cuántas visitas quedaron sin hacer, sin lenguaje de cierre', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: 2, descripcionSemanaCerrada: null, sinVisitar: ['101', '102'], ofrecimientosAutocompletados: 0,
        altas: [], bajas: [], rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.sincronizar).toHaveBeenCalled())
    // "Zona", no "semana", y "visitas" (cuenta filas del plan, no clientes distintos) —
    // nunca "cerramos"/"cerrada": el vendedor no ve que algo se cerró.
    expect(await screen.findByText(/zona 2: 2 visitas quedaron sin hacer/i)).toBeInTheDocument()
    expect(screen.queryByText(/cerr/i)).not.toBeInTheDocument()
})

it('con descripción de zona disponible, el aviso dice el nombre y no el número', async () => {
    // Misma fuente que el header (RotacionSemanaRepository.findDescripciones): sin esto
    // el aviso decía "Zona 2" mientras el header, dos taps después, ya decía "Zárate".
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: 2, descripcionSemanaCerrada: 'Zárate', sinVisitar: ['101'], ofrecimientosAutocompletados: 0,
        altas: [], bajas: [], rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.sincronizar).toHaveBeenCalled())
    expect(await screen.findByText(/zárate: 1 visitas quedaron sin hacer/i)).toBeInTheDocument()
    expect(screen.queryByText(/^zona 2/i)).not.toBeInTheDocument()
})

it('sin rotación materializada muestra el cartel, no un "Cargando…" eterno', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_SIN_ROTACION)
    renderPage()
    expect(await screen.findByText(/todavía no tenés una ruta asignada/i)).toBeInTheDocument()
    // Sin set de semanas no hay nada que previsualizar: pedirlo sería un 404 seguro.
    expect(api.previewSemana).not.toHaveBeenCalled()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})

it('el cierre de semana no se pierde cuando además cambió el padrón', async () => {
    // Los dos avisos salían con dos `mostrar` en el mismo tick y useNotificacion no tiene
    // cola: el de la ruta borraba el del cierre, que es el que importa.
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: 2, descripcionSemanaCerrada: null, sinVisitar: ['101', '102'], ofrecimientosAutocompletados: 0,
        altas: ['201'], bajas: ['301'], rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.sincronizar).toHaveBeenCalled())
    expect(await screen.findByText(/zona 2: 2 visitas quedaron sin hacer/i)).toBeInTheDocument()
    expect(screen.getByText(/tu ruta cambió/i)).toBeInTheDocument()
})

// ── Vocabulario: zona, no semana (spec 2026-08-12-semana-hecha-cierre-invisible) ──

it('el header muestra el nombre de la zona cuando la tiene', async () => {
    ;(api.getCicloActual as any).mockResolvedValue({
        ...CICLO_ACTUAL_ABIERTO,
        semanas: [
            { semana: 1, descripcion: null },
            { semana: 2, descripcion: null },
            { semana: 3, descripcion: 'Zárate' },
            { semana: 4, descripcion: null },
        ],
    })
    renderPage()
    expect(await screen.findByText(/^Zárate/)).toBeInTheDocument()
    expect(screen.queryByText(/^Semana 3/)).not.toBeInTheDocument()
})

it('el header cae al número de semana si la zona no tiene descripción', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO) // ZONAS: descripcion null
    renderPage()
    expect(await screen.findByText(/^Semana 3/)).toBeInTheDocument()
})

it('con vuelta abierta muestra la agenda operable, sin preview', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())
    expect(api.previewSemana).not.toHaveBeenCalled()
})

it('con vuelta abierta se puede espiar otra semana en solo lectura', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /zona siguiente/i }))

    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/vista previa/i)).toBeInTheDocument()
})

// Desde el spec 2026-08-14: el tap abre ventana/pestaña nueva (window.open), no el sheet
// embebido. AppExternaSheet/useAppExterna quedan sin invocar desde este camino (ver comentario
// en AppExternaSheet.tsx) — se conservan funcionales por si se reactiva el embebido, pero no
// hay wiring que los dispare desde la agenda.
it('abre pagos-lupa en una pestaña nueva con el contexto del cliente, sin montar el sheet embebido', async () => {
    fijarLunes() // el cliente está sembrado en LUN; con ciclo activo, HOY gana siempre
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))

    expect(open).toHaveBeenCalledTimes(1)
    const [urlArg, target, features] = open.mock.calls[0]
    const url = new URL(String(urlArg))
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('client')).toBe('10034')
    expect(url.searchParams.has('token')).toBe(false)
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')

    expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument()
    expect(screen.queryByTestId('app-externa-contenedor')).not.toBeInTheDocument()
    open.mockRestore()
})

// spec 2026-08-21 §6.3: el botón vive en el listado de clientes a visitar y la
// notificación de fallo sale del mismo `mensaje` que trae la respuesta del reintento.
it('reintentar la sincronización con Cromo avisa éxito y refresca la agenda', async () => {
    fijarLunes()
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({
        ...semanaVacia,
        LUN: [
            {
                ...clienteLunes,
                estado: 'visitada',
                visitaId: 7,
                seguimiento: { estado: 'pendiente', motivo: 'CRM_ERROR', mensaje: 'genérico' },
            },
        ],
    })
    ;(api.reintentarSeguimiento as any).mockResolvedValue({ enviado: true, mensaje: null })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /reintentar sincronización/i }))

    await waitFor(() => expect(api.reintentarSeguimiento).toHaveBeenCalledWith(7))
    expect(await screen.findByText(/sincronizado con cromo/i)).toBeInTheDocument()
    // Un reintento exitoso invalida la agenda: sin esto la fila seguiría marcada
    // pendiente y el botón no desaparecería nunca.
    await waitFor(() => expect((api.getAgendaSemana as any).mock.calls.length).toBeGreaterThan(1))
})

it('un reintento fallido muestra el mensaje que trae la respuesta, no uno armado en el front', async () => {
    fijarLunes()
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({
        ...semanaVacia,
        LUN: [
            {
                ...clienteLunes,
                estado: 'visitada',
                visitaId: 7,
                seguimiento: {
                    estado: 'pendiente',
                    motivo: 'VENDEDOR_SIN_MAPEO',
                    mensaje: 'Tu usuario todavía no está vinculado al CRM. Avisá a sistemas.',
                },
            },
        ],
    })
    ;(api.reintentarSeguimiento as any).mockResolvedValue({
        enviado: false,
        motivo: 'VENDEDOR_SIN_MAPEO',
        mensaje: 'Tu usuario todavía no está vinculado al CRM. Avisá a sistemas.',
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /reintentar sincronización/i }))

    expect(
        await screen.findByText('Tu usuario todavía no está vinculado al CRM. Avisá a sistemas.'),
    ).toBeInTheDocument()
})

it('volver a la semana abierta devuelve el modo operable', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /zona siguiente/i }))
    await screen.findByText(/vista previa/i)
    fireEvent.click(screen.getByRole('button', { name: /zona anterior/i }))

    await waitFor(() => expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument())
})
