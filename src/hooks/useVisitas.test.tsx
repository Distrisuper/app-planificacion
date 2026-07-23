import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useIniciarVisita } from './useVisitas'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useIniciarVisita calls the API and returns the visitaId', async () => {
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 42 })
    const { result } = renderHook(() => useIniciarVisita(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: null,
        })
    })
    expect(out.visitaId).toBe(42)
})
