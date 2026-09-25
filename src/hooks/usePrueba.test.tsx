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

it('suelta la visita en curso y los borradores locales: el backend acaba de borrarlos', async () => {
    // Sin esto, la barra "Visitando a…" sobrevivía al reinicio apuntando a una visita que ya
    // no existe, y cerrarla daba error.
    ;(reiniciarPrueba as any).mockResolvedValue({ codigo: 'PRUEBA-42', descripcion: 'Sin cartera', origenesDisponibles: [] })
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('visita-en-curso', '{"visitaId":7}')
    localStorage.setItem('visita-borrador-7', '{}')
    localStorage.setItem('visita-inicio-7', '123')
    const { wrapper } = crearWrapper()
    const { result } = renderHook(() => useReiniciarPrueba(), { wrapper })
    result.current.mutate(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(localStorage.getItem('visita-en-curso')).toBeNull()
    expect(localStorage.getItem('visita-borrador-7')).toBeNull()
    expect(localStorage.getItem('visita-inicio-7')).toBeNull()
    // La sesión sigue: el token no se toca.
    expect(localStorage.getItem('access_token')).toBe('tok')
})
