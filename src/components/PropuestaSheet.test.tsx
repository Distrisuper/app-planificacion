import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import PropuestaSheet from './PropuestaSheet'
import * as api from '@/api/planificacion'
import type { IVisitClientCard } from '@/types/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

const CLIENTE: IVisitClientCard = {
    codigoCliente: '1-10034',
    codigoParticularCliente: '10034',
    nombreCliente: 'Don José',
}

const MES = {
    yearMonth: '2026-07',
    actual: 600_000,
    projected: 600_000,
    baseline: 1_000_000,
    dropPct: -0.4,
    lost: 400_000,
    isRed: true,
}

function mockPropuesta() {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'Don José',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 1,
        rubros: [
            {
                rubroCode: 'R1',
                rubroDescription: 'Amortiguadores',
                isRedBoth: true,
                isFallback: false,
                pesosPerdidos: 400_000,
                current: MES,
                prev: MES,
                reason: 'Cayó 40%/40% vs. prom. 6M — $400.000 menos por mes',
            },
        ],
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'R1', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
    ])
})

it('shows the rubros returned by the proposal endpoint', async () => {
    mockPropuesta()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})

it('al iniciar la visita manda la propuesta mostrada al vendedor', async () => {
    mockPropuesta()
    const onIniciarVisita = vi.fn()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={onIniciarVisita}
                onClose={vi.fn()}
            />,
        ),
    )
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))

    expect(onIniciarVisita).toHaveBeenCalledWith([
        { rubroCode: 'R1', pesosPerdidos: 400_000, caidaPct: -0.4 },
    ])
})

it('un rubro de relleno con dropPct positivo (creció, no cayó) se manda como 0, no negativo', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'Don José',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 1,
        rubros: [
            {
                rubroCode: 'R2',
                rubroDescription: 'Filtros',
                isRedBoth: false,
                isFallback: true,
                pesosPerdidos: 0,
                current: { ...MES, dropPct: 0.4585 },
                prev: { ...MES, dropPct: 0.4585 },
                reason: 'Relleno',
            },
        ],
    })
    const onIniciarVisita = vi.fn()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={onIniciarVisita}
                onClose={vi.fn()}
            />,
        ),
    )
    await screen.findByText('Filtros')
    fireEvent.click(await screen.findByRole('button', { name: /iniciar visita/i }))

    expect(onIniciarVisita).toHaveBeenCalledWith([
        { rubroCode: 'R2', pesosPerdidos: 0, caidaPct: 0 },
    ])
})

it('muestra de una los rubros que no están en la propuesta, sin "Ver más"', async () => {
    mockPropuesta()
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'R1', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000, marcas: [] },
        { rubroCode: 'R9', nombre: 'Baterías', actual: 100_000, mesAnterior: 100_000, promedio6m: 100_000, marcas: [] },
    ])
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    await screen.findByText('Amortiguadores')
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()
})

it('con getRubroStatus caído se ve la tabla con los números de la propuesta y se puede iniciar visita', async () => {
    mockPropuesta()
    ;(api.getRubroStatus as any).mockRejectedValue(new Error('offline'))
    const onIniciarVisita = vi.fn()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={onIniciarVisita}
                onClose={vi.fn()}
            />,
        ),
    )
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    await waitFor(() => expect(onIniciarVisita).toHaveBeenCalled())
})

// Un cliente sin propuesta y sin historial YA NO deja la pantalla vacía: abajo va la
// lista 80/20 completa en '–' (ver `otrosRubros` en filas.ts). Ese es el punto — es el
// cliente donde más importa tener algo para ofrecer.
it('propuesta vacía y sin historial: igual lista los rubros del 80/20', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'Don José',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 0,
        rubros: [],
    })
    ;(api.getRubroStatus as any).mockResolvedValue([])
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    expect(await screen.findByText('AMORTIGUADORES')).toBeInTheDocument()
    expect(screen.getByText('KIT DISTRIBUCION')).toBeInTheDocument()
    expect(screen.queryByText('Sin oportunidades destacadas.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()
})

it('propuesta vacía con otros rubros del cliente: la tabla se ve de una', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'Don José',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 0,
        rubros: [],
    })
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'R9', nombre: 'Baterías', actual: 100_000, mesAnterior: 100_000, promedio6m: 100_000, marcas: [] },
    ])
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Sin oportunidades destacadas.')).not.toBeInTheDocument()
})

it('ofrece las apps externas cuando se le pasa el callback y el cliente', async () => {
    mockPropuesta()
    const onAbrirAppExterna = vi.fn()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                cliente={CLIENTE}
                onAbrirAppExterna={onAbrirAppExterna}
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(onAbrirAppExterna).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pagos' }),
        CLIENTE,
    )
})

it('no muestra apps externas si no se le pasa el callback', async () => {
    mockPropuesta()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
})

// ── Descuentos por marca (spec 2026-09-16 §7) ─────────────────────────────────

// La propuesta es cuando el vendedor decide QUÉ ofrecer: es el momento donde el
// descuento más pesa, antes de entrar. Mismo chip que en VisitaSheet.
const CON_DESCUENTO = [{ code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' }]

function renderPropuesta(cliente?: IVisitClientCard) {
    mockPropuesta()
    render(
        wrap(
            <PropuestaSheet
                open
                codigoCliente="10034"
                nombreCliente="Don José"
                cliente={cliente}
                onIniciarVisita={vi.fn()}
                onClose={vi.fn()}
            />,
        ),
    )
}

it('ofrece el chip de descuentos antes de iniciar la visita', async () => {
    renderPropuesta({ ...CLIENTE, brandDiscounts: CON_DESCUENTO })
    expect(await screen.findByRole('button', { name: /descuentos/i })).toBeInTheDocument()
})

it('el chip abre el sheet con la lista', async () => {
    renderPropuesta({ ...CLIENTE, brandDiscounts: CON_DESCUENTO })
    fireEvent.click(await screen.findByRole('button', { name: /descuentos/i }))
    expect(screen.getByText('Descuentos por marca')).toBeInTheDocument()
    expect(screen.getByText(/COBREQ · LIQUIDOS FRENO/)).toBeInTheDocument()
})

it('no ofrece el chip si no hay descuentos y no es suscriptor', async () => {
    renderPropuesta({ ...CLIENTE, brandDiscounts: [], bonusDiscount: 0 })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /descuentos/i })).not.toBeInTheDocument()
})

it('ofrece el chip al suscriptor aunque no tenga descuentos por marca', async () => {
    renderPropuesta({ ...CLIENTE, brandDiscounts: [], bonusDiscount: 45 })
    expect(await screen.findByRole('button', { name: /descuentos/i })).toBeInTheDocument()
})

it('sin cliente no rompe ni ofrece el chip', async () => {
    renderPropuesta(undefined)
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /descuentos/i })).not.toBeInTheDocument()
})
