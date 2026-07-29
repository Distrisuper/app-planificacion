import { render, screen, fireEvent } from '@testing-library/react'
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
    actual: 600,
    projected: 600,
    baseline: 1000,
    dropPct: -0.4,
    lost: 400,
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
                pesosPerdidos: 400,
                current: MES,
                prev: MES,
                reason: 'Cayó 40%/40% vs. prom. 6M — $400 menos por mes',
            },
        ],
    })
}

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
        { rubroCode: 'R1', pesosPerdidos: 400, caidaPct: -0.4 },
    ])
})

it('un rubro de relleno con dropPct positivo (creció, no cayó) se manda como 0, no negativo', async () => {
    // El backend exige -1 <= caidaPct <= 0 y rechaza cualquier otro valor con
    // PROPUESTA_INVALIDA. Los rubros de relleno (isFallback) pueden traer dropPct positivo
    // porque no llegaron al umbral de caída sostenida — no es una caída real.
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
