import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { usePropuesta } from './usePropuesta'
import * as api from '@/api/planificacion'
import type { IRubroMonthDrop } from '@/types/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const MES: IRubroMonthDrop = {
    yearMonth: '2026-07',
    actual: 600,
    projected: 600,
    baseline: 1000,
    dropPct: -0.4,
    lost: 400,
    isRed: true,
}

it('usePropuesta mapea los rubros caídos para la UI', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'LA MITRE SRL',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 1,
        rubros: [
            {
                rubroCode: 'R1',
                rubroDescription: 'Golosinas',
                isRedBoth: true,
                isFallback: false,
                pesosPerdidos: 400,
                current: MES,
                prev: MES,
                reason: 'Cayó 40%/40% vs. prom. 6M — $400 menos por mes',
            },
        ],
    })

    const { result } = renderHook(() => usePropuesta('10034'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({
        rubros: [
            {
                rubroCode: 'R1',
                nombre: 'Golosinas',
                pesosPerdidos: 400,
                caidaPct: -0.4,
                isFallback: false,
                reason: 'Cayó 40%/40% vs. prom. 6M — $400 menos por mes',
                current: MES,
                prev: MES,
            },
        ],
    })
})

it('usePropuesta devuelve lista vacía cuando el cliente no tiene rubros caídos', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({
        particularCode: '10034',
        clientName: 'LA MITRE SRL',
        sellerCode: '1',
        currentYM: '2026-07',
        daysElapsed: 24,
        totalDays: 31,
        inflationAdjusted: true,
        total: 0,
        rubros: [],
    })

    const { result } = renderHook(() => usePropuesta('10034'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ rubros: [] })
})
