import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useAlejadoDelCliente } from './useAlejadoDelCliente'

/** Igual patrón que MapaVisita.test.tsx: reemplaza `navigator` entero por un mock
 *  controlable. `wakeLockRequest` es opcional — cuando no se pasa, `navigator.wakeLock`
 *  directamente no existe, para probar el caso "la API no está". */
function mockNavigator(opts: {
    watchImpl?: (ok: any, err: any) => void
    getCurrentImpl?: (ok: any, err: any) => void
    wakeLockRequest?: any
}) {
    const watchPosition = vi.fn(opts.watchImpl ?? (() => {}))
    const getCurrentPosition = vi.fn(opts.getCurrentImpl ?? (() => {}))
    const clearWatch = vi.fn()
    const nav: any = { geolocation: { watchPosition, getCurrentPosition, clearWatch } }
    if (opts.wakeLockRequest) nav.wakeLock = { request: opts.wakeLockRequest }
    vi.stubGlobal('navigator', nav)
    return { watchPosition, getCurrentPosition, clearWatch }
}

function fix(latitude: number, longitude: number, accuracy: number) {
    return { coords: { latitude, longitude, accuracy } }
}

// Cliente en (0,0). ~0.01° de latitud ≈ 1.1 km — de sobra para "francamente lejos".
const CLIENTE = { latitud: 0, longitud: 0 }

beforeEach(() => vi.unstubAllGlobals())

it('dispara alejado cuando el fix está francamente lejos', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))

    expect(result.current.alejado).toBe(true)
})

it('no dispara con un fix grueso a distancia moderada: la precisión lo cubre', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    // ~150 m de distancia con 500 m de precisión: no prueba que esté fuera de rango.
    act(() => entregar(fix(0.00135, 0, 500)))

    expect(result.current.alejado).toBe(false)
})

it('no re-dispara oscilando en el borde: la salida exige la distancia cruda dentro del radio', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5))) // francamente lejos, fix preciso
    expect(result.current.alejado).toBe(true)

    // Un fix impreciso que igual marca una distancia cruda > 100 m: si la salida
    // descontara precisión (como la entrada), esto oscilaría a false y de vuelta a true
    // en el próximo tick. Con la salida sobre la distancia cruda, se queda en alejado.
    act(() => entregar(fix(0.001, 0, 200)))
    expect(result.current.alejado).toBe(true)

    // Recién vuelve dentro cuando la distancia CRUDA entra al radio.
    act(() => entregar(fix(0.0001, 0, 5)))
    expect(result.current.alejado).toBe(false)
})

it('chequea la posición al volver del background', () => {
    const { getCurrentPosition } = mockNavigator({})
    renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(getCurrentPosition).toHaveBeenCalled()
})

it('queda inactivo si el cliente no tiene coordenadas', () => {
    const { watchPosition } = mockNavigator({})
    renderHook(() => useAlejadoDelCliente({ activo: true, latitud: null, longitud: null }))

    expect(watchPosition).not.toHaveBeenCalled()
})

it('queda inactivo si la visita no está activa, aunque haya coordenadas', () => {
    const { watchPosition } = mockNavigator({})
    renderHook(() => useAlejadoDelCliente({ activo: false, ...CLIENTE }))

    expect(watchPosition).not.toHaveBeenCalled()
})

it('pide el wake lock al activarse, lo libera al desmontarse, y lo vuelve a pedir al volver del background', async () => {
    const release = vi.fn()
    const wakeLockRequest = vi.fn().mockResolvedValue({ release })
    mockNavigator({ wakeLockRequest })

    const { unmount } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))
    await act(async () => {})
    expect(wakeLockRequest).toHaveBeenCalledWith('screen')
    expect(wakeLockRequest).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(wakeLockRequest).toHaveBeenCalledTimes(2)

    unmount()
    expect(release).toHaveBeenCalled()
})

it('no rompe si navigator.wakeLock no existe', async () => {
    mockNavigator({})
    expect(() => {
        renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))
    }).not.toThrow()
    await act(async () => {})
})

it('no rompe si wakeLock.request() rechaza', async () => {
    const wakeLockRequest = vi.fn().mockRejectedValue(new Error('denegado'))
    mockNavigator({ wakeLockRequest })
    expect(() => {
        renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))
    }).not.toThrow()
    await act(async () => {})
})

it('limpia el watch y el listener de visibilitychange al desmontarse', () => {
    const { watchPosition, clearWatch, getCurrentPosition } = mockNavigator({
        watchImpl: () => 42,
    })
    ;(watchPosition as any).mockReturnValue(42)
    const { unmount } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    unmount()
    expect(clearWatch).toHaveBeenCalledWith(42)

    getCurrentPosition.mockClear()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getCurrentPosition).not.toHaveBeenCalled()
})

it('entra a alejado con un fix lejano aunque la precisión sea gruesa (caso Chrome DevTools Sensors)', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    // El override de ubicación de Chrome DevTools (panel Sensors) no tiene forma de
    // configurar la precisión desde la UI, y reporta un valor fijo por encima de
    // RADIO_INICIO_METROS. Con una distancia que aplasta cualquier margen de error
    // (~1.100 km), el fix tiene que seguir entrando: `d - p` sigue siendo evidencia
    // sólida de lejanía. Bloquearlo con una puerta ciega sobre la precisión (lo que
    // hacía la implementación anterior) rompía justo este caso.
    act(() => entregar(fix(10, 0, 150)))

    expect(result.current.alejado).toBe(true)
})

it('un fix ambiguo no saca del aviso, pero sí actualiza la distancia mostrada', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))
    expect(result.current.alejado).toBe(true)

    // ~180 m con 150 m de precisión: `d + p` = 330 > 100, no alcanza para probar que
    // volvió (evidencia insuficiente, no evidencia de lo contrario). Se queda en
    // alejado, pero la distancia que se muestra sí se actualiza al último fix conocido.
    act(() => entregar(fix(0.00162, 0, 150)))

    expect(result.current.alejado).toBe(true)
    expect(result.current.distanciaM).toBeCloseTo(180, -1)
})

it('la salida exige evidencia de cercanía aun en el peor caso para el fix', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))
    expect(result.current.alejado).toBe(true)

    // ~56 m con 60 m de precisión: `d + p` = 116 > 100 — ni en el mejor caso (d - p)
    // ni en el peor (d + p) hay evidencia concluyente, así que no sale.
    act(() => result.current.evaluarFix(0.0005, 0, 60))
    expect(result.current.alejado).toBe(true)

    // ~56 m con 40 m de precisión: `d + p` = 96 <= 100 — aun en el peor caso, adentro.
    act(() => result.current.evaluarFix(0.0005, 0, 40))
    expect(result.current.alejado).toBe(false)
})

it('evaluarFix apaga el aviso con un fix fino y cercano', () => {
    let entregar: any
    mockNavigator({ watchImpl: ok => (entregar = ok) })
    const { result } = renderHook(() => useAlejadoDelCliente({ activo: true, ...CLIENTE }))

    act(() => entregar(fix(0.01, 0, 5)))
    expect(result.current.alejado).toBe(true)

    // ~44 m del cliente con 15 m de precisión: `d + p` = 59 <= 100.
    act(() => result.current.evaluarFix(0.0004, 0, 15))

    expect(result.current.alejado).toBe(false)
})
