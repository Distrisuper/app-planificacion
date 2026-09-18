import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useReiniciarPrueba } from './usePrueba'

vi.mock('@/api/planificacion', () => ({ reiniciarPrueba: vi.fn() }))
const refrescarMe = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refrescarMe }) }))
import { reiniciarPrueba } from '@/api/planificacion'

function crearWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
    return { qc, wrapper }
}

beforeEach(() => vi.clearAllMocks())

it('reinicia, invalida TODAS las queries y refresca /me', async () => {
    ;(reiniciarPrueba as any).mockResolvedValue({ codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] })
    const { qc, wrapper } = crearWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useReiniciarPrueba(), { wrapper })
    result.current.mutate('V 2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reiniciarPrueba).toHaveBeenCalledWith('V 2')
    expect(spy).toHaveBeenCalledWith()
    expect(refrescarMe).toHaveBeenCalledTimes(1)
})
