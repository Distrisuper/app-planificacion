import { act, renderHook } from '@testing-library/react'
import { useAlturaTeclado } from './useAlturaTeclado'

/** `visualViewport` no existe en jsdom: se simula como un EventTarget real (así
 *  `dispatchEvent` funciona igual que en el browser) con `height`/`offsetTop` propios. */
function crearVisualViewport(overrides: { height: number; offsetTop?: number }) {
    return Object.assign(new EventTarget(), {
        height: overrides.height,
        offsetTop: overrides.offsetTop ?? 0,
    })
}

function stubVisualViewport(vv: unknown) {
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
}

const innerHeightOriginal = window.innerHeight

afterEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: innerHeightOriginal, configurable: true })
    stubVisualViewport(undefined)
})

it('sin visualViewport (jsdom real, o browsers sin soporte) devuelve 0', () => {
    stubVisualViewport(undefined)
    const { result } = renderHook(() => useAlturaTeclado(true))
    expect(result.current).toBe(0)
})

it('sin teclado abierto (visualViewport.height == innerHeight) devuelve 0', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    stubVisualViewport(crearVisualViewport({ height: 800 }))
    const { result } = renderHook(() => useAlturaTeclado(true))
    expect(result.current).toBe(0)
})

it('con el teclado abierto en Android (innerHeight ya achicado) devuelve 0', () => {
    // `interactive-widget=resizes-content` ya achicó el layout viewport: innerHeight
    // bajó junto con visualViewport.height, sin necesidad de este cálculo.
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true })
    stubVisualViewport(crearVisualViewport({ height: 500 }))
    const { result } = renderHook(() => useAlturaTeclado(true))
    expect(result.current).toBe(0)
})

it('con el teclado abierto en iOS (innerHeight fijo, visualViewport se achica) calcula lo tapado', () => {
    // iOS no achica el layout viewport: innerHeight se queda en 800, y lo que el
    // teclado tapa es la diferencia contra el visual viewport.
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    stubVisualViewport(vv)

    const { result } = renderHook(() => useAlturaTeclado(true))
    act(() => vv.dispatchEvent(new Event('resize')))

    expect(result.current).toBe(320)
})

it('descuenta offsetTop: iOS a veces también panea el visual viewport hacia abajo', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480, offsetTop: 20 })
    stubVisualViewport(vv)

    const { result } = renderHook(() => useAlturaTeclado(true))
    act(() => vv.dispatchEvent(new Event('resize')))

    expect(result.current).toBe(300)
})

it('no activo: no se subscribe, y devuelve 0 aunque haya teclado', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    const addEventListener = vi.spyOn(vv, 'addEventListener')
    stubVisualViewport(vv)

    const { result } = renderHook(() => useAlturaTeclado(false))

    expect(result.current).toBe(0)
    expect(addEventListener).not.toHaveBeenCalled()
})

it('se resuelve al cambiar de inactivo a activo, y vuelve a 0 al desactivarse', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    stubVisualViewport(vv)

    const { result, rerender } = renderHook(({ activo }) => useAlturaTeclado(activo), {
        initialProps: { activo: false },
    })
    expect(result.current).toBe(0)

    rerender({ activo: true })
    expect(result.current).toBe(320)

    rerender({ activo: false })
    expect(result.current).toBe(0)
})

it('reacciona a resize y scroll del visualViewport, y se desuscribe al desmontar', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 800 })
    stubVisualViewport(vv)

    const { result, unmount } = renderHook(() => useAlturaTeclado(true))
    expect(result.current).toBe(0)

    vv.height = 480
    act(() => vv.dispatchEvent(new Event('resize')))
    expect(result.current).toBe(320)

    vv.offsetTop = 20
    act(() => vv.dispatchEvent(new Event('scroll')))
    expect(result.current).toBe(300)

    const removeEventListener = vi.spyOn(vv, 'removeEventListener')
    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
})
