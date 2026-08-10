import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    semanas: [1, 2, 3, 4],
    semanasPendientes: [3, 4],
}
const CICLO_ACTUAL_STANDBY = {
    ciclo: null,
    semanas: [1, 2, 3, 4],
    semanasPendientes: [3, 4],
}
/** Sin pendientes conocidos: fuerza la caída al primer elemento de `semanas` (no de
 *  `semanasPendientes`) — es el caso que exige el test de wrap sobre el set real. */
const CICLO_ACTUAL_STANDBY_SIN_PENDIENTES = {
    ciclo: null,
    semanas: [1, 2, 3, 4],
    semanasPendientes: [],
}

const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }

const clienteLunes = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    rotacionClienteId: 42,
    dia: 1,
    estado: 'pendiente' as const,
    visitaId: null,
    rubrosPendientes: 0,
}

/** Segundo cliente del mismo día: es lo que hace falta para cambiar de cliente sin cambiar
 *  de día (el cambio de día desmonta la instancia por otro camino). */
const otroClienteLunes = {
    ...clienteLunes,
    codigoCliente: 'C2',
    codigoParticularCliente: '20077',
    nombreCliente: 'KIOSCO RUBEN',
    rotacionClienteId: 43,
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
        sinVisitar: [],
        rubrosAutocompletados: 0,
        altas: [],
        bajas: [],
        rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({
        semana: 3, clientes: 39, omitidos: [], dias: semanaVacia,
    })
})

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

it('?dia= respeta el día que venía en la URL al recargar', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage('/?dia=JUE')

    const tab = await screen.findByRole('button', { name: /^JUE/ })
    expect(tab.className).toMatch(/bg-dsnavy/)
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

it('?semana= respeta la semana que se estaba mirando al recargar', async () => {
    // Ciclo abierto en la 3, pero la URL dice que estaba hojeando la 4: gana la URL, y por
    // no ser la vuelta abierta la página queda en modo preview (pide el preview de la 4).
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.previewSemana as any).mockResolvedValue({
        semana: 4, clientes: 12, omitidos: [], dias: semanaVacia,
    })
    renderPage('/?semana=4')

    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/Semana 4/)).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))

    await waitFor(() => expect(urlActual()).toContain('semana=4'))
})

it('no escribe la URL al montar: / queda limpio', async () => {
    // Si canonicalizara a /?dia=..., un bookmark congelaría un día viejo y abrir la app
    // de cero dejaría de significar "hoy".
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    const { urlActual } = renderPage()
    await screen.findByText(/Semana 3/)

    expect(urlActual()).toBe('/')
})

it('las flechas hacen wrap sobre el set real de semanas, no sobre 5 fijo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY_SIN_PENDIENTES) // semanas: [1,2,3,4]
    ;(api.previewSemana as any).mockImplementation((s: number) =>
        Promise.resolve({ semana: s, clientes: 0, omitidos: [], dias: semanaVacia }),
    )
    renderPage()
    await screen.findByText(/semana 1/i) // arranca en la primera semana conocida
    fireEvent.click(screen.getByRole('button', { name: /semana anterior/i }))
    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4)) // wrap 1 -> 4, no -> 0
})

it('sincroniza al montar y avisa si cerró una semana con pendientes', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_STANDBY)
    ;(api.sincronizar as any).mockResolvedValue({
        semanaCerrada: 2, sinVisitar: ['101', '102'], rubrosAutocompletados: 0,
        altas: [], bajas: [], rotacionCerrada: false,
    })
    ;(api.previewSemana as any).mockResolvedValue({ semana: 3, clientes: 0, omitidos: [], dias: semanaVacia })
    renderPage()
    await waitFor(() => expect(api.sincronizar).toHaveBeenCalled())
    expect(await screen.findByText(/semana 2/i)).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))

    await waitFor(() => expect(api.previewSemana).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/vista previa/i)).toBeInTheDocument()
})

it('abre pagos-lupa embebido con el contexto del cliente desde la agenda', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    // Se siembra el cliente en LUN y se entra con ?dia=LUN: sin `dia` la página arranca
    // en HOY, que cambia según el día en que corra la suite.
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))

    const iframe = screen.getByTitle('Pagos')
    const url = new URL(iframe.getAttribute('src') as string)
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('client')).toBe('10034')
    expect(url.searchParams.has('token')).toBe(false)

    fireEvent.click(screen.getByLabelText('Cerrar'))
    // Oculto pero montado: reabrir tiene que ser instantáneo.
    expect(screen.getByTitle('Pagos')).toBeInTheDocument()
})

// Cambiar de cliente tiene que REMONTAR el iframe, no reescribirle el `src`: navegar un
// browsing context anidado suma una entrada al historial del top-level y en la PWA de
// Android el gesto de "atrás" pasa a retroceder dentro del iframe.
it('abrir otro cliente monta un iframe nuevo en vez de navegar el vivo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({
        ...semanaVacia,
        LUN: [clienteLunes, otroClienteLunes],
    })
    renderPage('/?dia=LUN')

    const [pagosA, pagosB] = await screen.findAllByRole('button', { name: 'Pagos' })
    fireEvent.click(pagosA)
    const antes = screen.getByTitle('Pagos')
    expect(new URL(antes.getAttribute('src') as string).searchParams.get('client')).toBe('10034')

    fireEvent.click(screen.getByLabelText('Cerrar'))
    fireEvent.click(pagosB)

    const despues = screen.getByTitle('Pagos')
    expect(despues).not.toBe(antes)
    expect(new URL(despues.getAttribute('src') as string).searchParams.get('client')).toBe('20077')
})

// La contracara: ocultar ≠ desmontar. Con el mismo cliente la key no cambia, así que el
// nodo del iframe es el MISMO y reabrir es instantáneo (no recarga el bundle ajeno).
it('reabrir el mismo cliente reusa el iframe vivo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    const antes = screen.getByTitle('Pagos')

    fireEvent.click(screen.getByLabelText('Cerrar'))
    // Ocultar no desmonta: el sheet sigue en el DOM con su propia tab "Pagos", así que a
    // partir de acá hay dos botones con ese nombre (el chip de la card y la tab). El de la
    // card es el que sigue haciendo lo mismo que antes: reabrir el mismo cliente.
    fireEvent.click(screen.getAllByRole('button', { name: 'Pagos' })[0])

    expect(screen.getByTitle('Pagos')).toBe(antes)
})

// El pedido original: pasar de una app a otra del mismo cliente sin cerrar el sheet.
it('tocar otra tab dentro del sheet mantiene la primera app viva y cambia el frame visible', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    const framePagos = screen.getByTitle('Pagos')

    const sheet = screen.getByTestId('app-externa-contenedor')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Versus' }))

    expect(screen.getByTitle('Versus')).toBeInTheDocument()
    // Pagos sigue en el DOM (no se recargó al volver): mismo nodo, ahora oculto.
    expect(screen.getByTitle('Pagos')).toBe(framePagos)
})

it('suelta la instancia embebida al cambiar de semana', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(screen.getByTitle('Pagos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument())
})

it('suelta la instancia embebida al cambiar de día', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(screen.getByTitle('Pagos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^MAR/ }))
    expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument()
})

it('volver a la semana abierta devuelve el modo operable', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(CICLO_ACTUAL_ABIERTO)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await screen.findByText(/vista previa/i)
    fireEvent.click(screen.getByRole('button', { name: /semana anterior/i }))

    await waitFor(() => expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument())
})
