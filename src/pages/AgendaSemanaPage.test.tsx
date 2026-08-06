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

const cicloAbierto = {
    id: 1, codigoParticularVendedor: 'V 2', semana: 3,
    fechaApertura: '2026-07-27T10:00:00Z', fechaCierre: null, estado: 'abierta' as const,
}

const semanaVacia = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }

const clienteLunes = {
    codigoCliente: 'C1',
    codigoParticularCliente: '10034',
    nombreCliente: 'ALMACEN DON JOSE',
    cicloClienteId: 42,
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
    cicloClienteId: 43,
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
    ;(api.getCicloPreview as any).mockResolvedValue({
        semana: 3, clientes: 39, omitidos: [], dias: semanaVacia,
    })
})

it('sin vuelta abierta NO pide la agenda y ofrece abrir', async () => {
    // Ramificar sobre cicloActual === null (un dato) en vez de sobre el 409 de la agenda.
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()

    expect(await screen.findByRole('button', { name: /abrir semana/i })).toBeInTheDocument()
    expect(api.getAgendaSemana).not.toHaveBeenCalled()
})

it('sin vuelta abierta muestra la semana propuesta por el backend', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()
    // El título del header y el CTA de CicloVacio ambos dicen "Semana 3" (a propósito:
    // Task 9 fix-round — el título usa semanaBase para no quedarse en "Cargando…"), así
    // que se apunta al botón puntualmente para no depender de cuál de los dos matchea.
    expect(await screen.findByRole('button', { name: /abrir semana 3/i })).toBeInTheDocument()
    expect(api.getCicloPreview).toHaveBeenCalledWith(undefined)
})

it('las flechas navegan las semanas de la rotación', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    renderPage()
    await screen.findByRole('button', { name: /abrir semana 3/i })
    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(4))
})

// ── Posición (semana + día) en la URL ──────────────────────────────────────────
// Recargar la página volvía al lunes de la vuelta abierta y le hacía perder al vendedor
// dónde estaba. Ahora la posición vive en la URL, así que sobrevive la recarga.

it('sin ?dia arranca en HOY, no en LUN', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()

    const hoy = getDiaDeHoy() ?? 'LUN'
    const tab = await screen.findByRole('button', { name: new RegExp(`^${hoy}`) })
    // El tab activo es el único con el fondo navy.
    expect(tab.className).toMatch(/bg-dsnavy/)
})

it('?dia= respeta el día que venía en la URL al recargar', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage('/?dia=JUE')

    const tab = await screen.findByRole('button', { name: /^JUE/ })
    expect(tab.className).toMatch(/bg-dsnavy/)
})

it('un ?dia inválido no rompe: cae a hoy', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage('/?dia=BASURA')

    const hoy = getDiaDeHoy() ?? 'LUN'
    const tab = await screen.findByRole('button', { name: new RegExp(`^${hoy}`) })
    expect(tab.className).toMatch(/bg-dsnavy/)
})

it('elegir un día lo escribe en la URL', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    const { urlActual } = renderPage()
    await screen.findByRole('button', { name: /^MIE/ })

    fireEvent.click(screen.getByRole('button', { name: /^MIE/ }))

    await waitFor(() => expect(urlActual()).toContain('dia=MIE'))
})

it('?semana= respeta la semana que se estaba mirando al recargar', async () => {
    // Ciclo abierto en la 3, pero la URL dice que estaba hojeando la 5: gana la URL, y por
    // no ser la vuelta abierta la página queda en modo preview (pide el preview de la 5).
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    ;(api.getCicloPreview as any).mockResolvedValue({
        semana: 5, clientes: 12, omitidos: [], dias: semanaVacia,
    })
    renderPage('/?semana=5')

    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(5))
    expect(await screen.findByText(/Semana 5/)).toBeInTheDocument()
})

it('una ?semana fuera de la rotación se ignora y vale la vuelta abierta', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage('/?semana=99')

    expect(await screen.findByText(/Semana 3/)).toBeInTheDocument()
    expect(api.getCicloPreview).not.toHaveBeenCalled()
})

it('moverse de semana lo escribe en la URL', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    const { urlActual } = renderPage()
    await screen.findByText(/Semana 3/)

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))

    await waitFor(() => expect(urlActual()).toContain('semana=4'))
})

it('no escribe la URL al montar: / queda limpio', async () => {
    // Si canonicalizara a /?dia=..., un bookmark congelaría un día viejo y abrir la app
    // de cero dejaría de significar "hoy".
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    const { urlActual } = renderPage()
    await screen.findByText(/Semana 3/)

    expect(urlActual()).toBe('/')
})

it('las flechas hacen wrap de 5 a 1', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.getCicloPreview as any).mockResolvedValue({
        semana: 5, clientes: 47, omitidos: [], dias: semanaVacia,
    })
    renderPage()
    await screen.findByRole('button', { name: /abrir semana 5/i })
    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(1))
})

it('abrir la semana usa la que se está viendo', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.abrirCiclo as any).mockResolvedValue({
        cicloId: 1, semana: 3, clientes: 39, omitidos: [],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /abrir semana/i }))
    await waitFor(() => expect(api.abrirCiclo).toHaveBeenCalledWith(3))
})

it('con vuelta abierta muestra la agenda operable, sin preview', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())
    expect(api.getCicloPreview).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /abrir semana/i })).not.toBeInTheDocument()
})

it('con vuelta abierta se puede espiar otra semana en solo lectura', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))

    await waitFor(() => expect(api.getCicloPreview).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/vista previa/i)).toBeInTheDocument()
})

it('un usuario sin código de vendedor recibe un mensaje de cuenta, no "reintentá"', async () => {
    // No es reintentable: es configuración del usuario. Un "volvé a intentar" lo dejaría
    // tocando el botón contra algo que nunca va a andar.
    ;(api.getCicloActual as any).mockResolvedValue(null)
    ;(api.abrirCiclo as any).mockRejectedValue({
        response: { status: 400, data: { ok: 0, code: 'SELLER_CODE_UNRESOLVED' } },
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /abrir semana/i }))
    expect(await screen.findByText(/avisá a sistemas/i)).toBeInTheDocument()
})

it('abre pagos-lupa embebido con el contexto del cliente desde la agenda', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
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
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
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
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    const antes = screen.getByTitle('Pagos')

    fireEvent.click(screen.getByLabelText('Cerrar'))
    fireEvent.click(screen.getByRole('button', { name: 'Pagos' }))

    expect(screen.getByTitle('Pagos')).toBe(antes)
})

it('suelta la instancia embebida al cambiar de semana', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(screen.getByTitle('Pagos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await waitFor(() => expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument())
})

it('suelta la instancia embebida al cambiar de día', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    ;(api.getAgendaSemana as any).mockResolvedValue({ ...semanaVacia, LUN: [clienteLunes] })
    renderPage('/?dia=LUN')

    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(screen.getByTitle('Pagos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^MAR/ }))
    expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument()
})

it('volver a la semana abierta devuelve el modo operable', async () => {
    ;(api.getCicloActual as any).mockResolvedValue(cicloAbierto)
    renderPage()
    await waitFor(() => expect(api.getAgendaSemana).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /semana siguiente/i }))
    await screen.findByText(/vista previa/i)
    fireEvent.click(screen.getByRole('button', { name: /semana anterior/i }))

    await waitFor(() => expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument())
})
