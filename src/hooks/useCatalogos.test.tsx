import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useBrandCatalog } from './useCatalogos'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

beforeEach(() => vi.clearAllMocks())

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// El catálogo sale de fct_sales.brand_name, que además de marcas reales trae códigos
// administrativos del ERP (ACC, 120, 108, 121 — ver docs/superpowers) que no son una marca
// que el vendedor pueda elegir. Se excluyen acá, en el único lugar que arma este catálogo
// para el picker — de última, hasta que el warehouse tenga de dónde distinguirlos sin
// hardcodear nombres.
it('excluye del catálogo de marcas los códigos administrativos que no son una marca real', async () => {
    ;(api.getBrandCatalog as any).mockResolvedValue([
        { code: '1', description: 'ACEITES' },
        { code: 'ACC', description: 'ACCION COMERCIAL' },
        { code: '120', description: 'FEE POR SUSCRIPCION' },
        { code: '121', description: 'OP UNICA' },
        { code: '108', description: 'OPERACION ESPECIAL' },
        { code: '096', description: 'SKF' },
    ])
    const { result } = renderHook(() => useBrandCatalog(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([
        { code: '1', description: 'ACEITES' },
        { code: '096', description: 'SKF' },
    ])
})
