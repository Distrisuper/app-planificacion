import { act, renderHook } from '@testing-library/react'
import { useViewportTeclado } from './useViewportTeclado'

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

it('sin visualViewport (jsdom real, o browsers sin soporte) no desplaza nada', () => {
    stubVisualViewport(undefined)
    const { result } = renderHook(() => useViewportTeclado(true))
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })
})

it('sin teclado abierto (visualViewport.height == innerHeight) no desplaza nada', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    stubVisualViewport(crearVisualViewport({ height: 800 }))
    const { result } = renderHook(() => useViewportTeclado(true))
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })
})

it('con el teclado abierto en Android (innerHeight ya achicado) no desplaza nada', () => {
    // `interactive-widget=resizes-content` ya achicó el layout viewport: innerHeight
    // bajó junto con visualViewport.height, sin necesidad de este cálculo.
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true })
    stubVisualViewport(crearVisualViewport({ height: 500 }))
    const { result } = renderHook(() => useViewportTeclado(true))
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })
})

it('con el teclado abierto en iOS (innerHeight fijo, visualViewport se achica) calcula lo tapado', () => {
    // iOS no achica el layout viewport: innerHeight se queda en 800, y lo que el
    // teclado tapa es la diferencia contra el visual viewport.
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    stubVisualViewport(vv)

    const { result } = renderHook(() => useViewportTeclado(true))
    act(() => vv.dispatchEvent(new Event('resize')))

    expect(result.current).toEqual({ tapado: 320, desplazado: 0 })
})

it('separa el paneo (offsetTop) de lo tapado, y entre los dos dejan la franja visible', () => {
    // iOS también panea el visual viewport hacia abajo para traer el input a la vista:
    // los 800 del layout viewport se reparten en 20 arriba + 480 visibles + 300 de
    // teclado. `tapado` y `desplazado` son esos dos bordes, no uno solo.
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480, offsetTop: 20 })
    stubVisualViewport(vv)

    const { result } = renderHook(() => useViewportTeclado(true))
    act(() => vv.dispatchEvent(new Event('resize')))

    expect(result.current).toEqual({ tapado: 300, desplazado: 20 })
})

it('no activo: no se subscribe, y no desplaza nada aunque haya teclado', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    const addEventListener = vi.spyOn(vv, 'addEventListener')
    stubVisualViewport(vv)

    const { result } = renderHook(() => useViewportTeclado(false))

    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })
    expect(addEventListener).not.toHaveBeenCalled()
})

it('se resuelve al cambiar de inactivo a activo, y vuelve a cero al desactivarse', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    stubVisualViewport(vv)

    const { result, rerender } = renderHook(({ activo }) => useViewportTeclado(activo), {
        initialProps: { activo: false },
    })
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })

    rerender({ activo: true })
    expect(result.current).toEqual({ tapado: 320, desplazado: 0 })

    rerender({ activo: false })
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })
})

/** El objeto se re-crea en cada medición, así que sin comparar contenido cada evento
 *  del visualViewport (y son muchos: iOS los dispara en ráfaga mientras el teclado
 *  anima) re-renderizaría el sheet entero aunque nada se haya movido. */
it('mantiene la MISMA referencia mientras los números no cambian', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 480 })
    stubVisualViewport(vv)

    const { result } = renderHook(() => useViewportTeclado(true))
    const primero = result.current

    act(() => vv.dispatchEvent(new Event('resize')))
    act(() => vv.dispatchEvent(new Event('scroll')))

    expect(result.current).toBe(primero)
})

it('reacciona a resize y scroll del visualViewport, y se desuscribe al desmontar', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const vv = crearVisualViewport({ height: 800 })
    stubVisualViewport(vv)

    const { result, unmount } = renderHook(() => useViewportTeclado(true))
    expect(result.current).toEqual({ tapado: 0, desplazado: 0 })

    vv.height = 480
    act(() => vv.dispatchEvent(new Event('resize')))
    expect(result.current).toEqual({ tapado: 320, desplazado: 0 })

    vv.offsetTop = 20
    act(() => vv.dispatchEvent(new Event('scroll')))
    expect(result.current).toEqual({ tapado: 300, desplazado: 20 })

    const removeEventListener = vi.spyOn(vv, 'removeEventListener')
    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
})
