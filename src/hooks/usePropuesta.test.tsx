import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { usePropuesta } from './usePropuesta'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('usePropuesta unwraps the matched client and maps rubros for the UI', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        total: 1,
        clients: [
            {
                clientCode: '10034',
                particularCode: '10034',
                clientName: 'LA MITRE SRL',
                sellerCode: '1',
                sellerName: 'Vendedor',
                rubros: [
                    {
                        rubroCode: 'R1',
                        rubroDescription: 'Golosinas',
                        rubroMinUnits: 100,
                        gapUnits: 40,
                        projection: {
                            currentMonthUnits: 60,
                            projectedUnits: 60,
                            rubroRatio: 0.6,
                            daysElapsed: 24,
                            totalDays: 31,
                        },
                        lookback: { months: [], activeMonths: 3, avgUnits: 55 },
                        articlesToOffer: [],
                        reason: 'Lleva 60% del mínimo (faltan ~40 ud. de Golosinas)',
                    },
                ],
            },
        ],
    })

    const { result } = renderHook(() => usePropuesta('10034'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({
        rubros: [{ nombre: 'Golosinas', gapPct: 40 }],
    })
})

it('usePropuesta returns no rubros when the client has no matching entry', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        total: 0,
        clients: [],
    })

    const { result } = renderHook(() => usePropuesta('10034'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ rubros: [] })
})
