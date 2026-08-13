import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useAcciones } from './useAcciones'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

it('trae el catálogo de acciones', async () => {
    ;(api.getAcciones as any).mockResolvedValue([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])

    const { result } = renderHook(() => useAcciones(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])
})
