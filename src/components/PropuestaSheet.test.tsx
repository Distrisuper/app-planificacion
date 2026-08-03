import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import PropuestaSheet from './PropuestaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
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
        { rubroCode: 'R1', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 },
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

it('"Ver más" trae un rubro que no está en la propuesta', async () => {
    mockPropuesta()
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'R1', nombre: 'Amortiguadores', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 },
        { rubroCode: 'R9', nombre: 'Baterías', actual: 100_000, mesAnterior: 100_000, promedio6m: 100_000 },
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
    expect(screen.queryByText('Baterías')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
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

it('propuesta vacía sin otros rubros: solo el mensaje, sin botón Ver más', async () => {
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
    expect(await screen.findByText('Sin oportunidades destacadas.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()
})

it('propuesta vacía con otros rubros del cliente: "Ver más" trae la tabla', async () => {
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
        { rubroCode: 'R9', nombre: 'Baterías', actual: 100_000, mesAnterior: 100_000, promedio6m: 100_000 },
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
    expect(await screen.findByText('Sin oportunidades destacadas.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Sin oportunidades destacadas.')).not.toBeInTheDocument()
})
