import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useFiltroAnalitica } from './useFiltroAnalitica'

function wrapperCon(ruta: string) {
    return ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
    )
}

it('sin parámetros arranca con la semana en curso', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), { wrapper: wrapperCon('/analitica') })
    expect(result.current.filtro.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.filtro.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.filtro.desde <= result.current.filtro.hasta).toBe(true)
})

it('lee el rango y los vendedores de la query string', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1,V4'),
    })
    expect(result.current.filtro.desde).toBe('2026-07-20')
    expect(result.current.filtro.hasta).toBe('2026-07-24')
    expect(result.current.filtro.vendedores).toEqual(['V1', 'V4'])
})

it('cambiar el rango se refleja en el filtro', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24'),
    })
    act(() => result.current.setRango('2026-07-01', '2026-07-15'))
    expect(result.current.filtro.desde).toBe('2026-07-01')
    expect(result.current.filtro.hasta).toBe('2026-07-15')
})

it('toggleVendedor agrega y saca del filtro', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1'),
    })
    act(() => result.current.toggleVendedor('V4'))
    expect(result.current.filtro.vendedores).toEqual(['V1', 'V4'])
    act(() => result.current.toggleVendedor('V1'))
    expect(result.current.filtro.vendedores).toEqual(['V4'])
})

it('limpiarVendedores deja el filtro en todos', () => {
    const { result } = renderHook(() => useFiltroAnalitica(), {
        wrapper: wrapperCon('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1,V4'),
    })
    act(() => result.current.limpiarVendedores())
    expect(result.current.filtro.vendedores).toEqual([])
})
