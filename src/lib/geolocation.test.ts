import { vi } from 'vitest'
import { capturarUbicacion } from './geolocation'

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

function mockGeolocation(impl: (...args: any[]) => void) {
    const getCurrentPosition = vi.fn(impl)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    return getCurrentPosition
}

beforeEach(() => vi.unstubAllGlobals())

it('devuelve la coordenada cuando el GPS resuelve en la etapa 1', async () => {
    const spy = mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.38, accuracy: 12 } }),
    )

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-34.60000000,-58.38000000', precisionM: 12 })
    expect(spy).toHaveBeenCalledTimes(1)
})

it('trunca coordenadas de precisión completa a 8 decimales para pasar la validación del backend', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -37.97837090373625, longitude: -57.57729522372346, accuracy: 15 } }),
    )

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-37.97837090,-57.57729522', precisionM: 15 })
})

it('permiso denegado corta sin etapa 2', async () => {
    // El caso deliberado: reintentar no cambiaría nada y solo demoraría el bloqueo.
    const spy = mockGeolocation((_ok: any, fail: any) => fail({ code: PERMISSION_DENIED }))

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'denegado' })
    expect(spy).toHaveBeenCalledTimes(1)
})

it('timeout en la etapa 1 reintenta con baja precisión', async () => {
    const spy = mockGeolocation((ok: any, fail: any, opts: any) => {
        if (opts.enableHighAccuracy) return fail({ code: TIMEOUT })
        ok({ coords: { latitude: -34.7, longitude: -58.4, accuracy: 480 } })
    })

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-34.70000000,-58.40000000', precisionM: 480 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1][2].enableHighAccuracy).toBe(false)
})

it('posición no disponible en la etapa 1 también reintenta', async () => {
    const spy = mockGeolocation((ok: any, fail: any, opts: any) => {
        if (opts.enableHighAccuracy) return fail({ code: POSITION_UNAVAILABLE })
        ok({ coords: { latitude: -34.7, longitude: -58.4, accuracy: 900 } })
    })

    const res = await capturarUbicacion()

    expect(res).toMatchObject({ ok: true })
    expect(spy).toHaveBeenCalledTimes(2)
})

it('acepta un fix reciente que el navegador ya tenía en vez de expirar', async () => {
    // Reproduce el bug real: en una PC de escritorio (sin GPS, sin Wi-Fi que escanear) el
    // navegador resuelve la posición UNA vez por red y se la sirve al `watchPosition` del
    // mapa, pero no puede producir un fix NUEVO a pedido. Con `maximumAge: 0` las dos
    // etapas esperaban una lectura fresca que nunca llegaba y expiraban a los 23s.
    const spy = mockGeolocation((ok: any, fail: any, opts: any) => {
        if (!opts.maximumAge) return fail({ code: TIMEOUT })
        ok({ coords: { latitude: -37.9976, longitude: -57.5482, accuracy: 40 } })
    })

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: true, coord: '-37.99760000,-57.54820000', precisionM: 40 })
    expect(spy.mock.calls[0][2].maximumAge).toBeGreaterThan(0)
})

it('no acepta un fix viejo: el maximumAge queda acotado para que siga probando presencia', async () => {
    // La coordenada existe para verificar que el vendedor estuvo en el cliente. Un
    // maximumAge generoso dejaría cerrar la visita con la posición del inicio.
    const spy = mockGeolocation((_ok: any, fail: any) => fail({ code: TIMEOUT }))

    await capturarUbicacion()

    for (const call of spy.mock.calls) {
        expect(call[2].maximumAge).toBeLessThanOrEqual(60_000)
    }
})

it('si fallan las dos etapas devuelve sin_senal', async () => {
    const spy = mockGeolocation((_ok: any, fail: any) => fail({ code: TIMEOUT }))

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'sin_senal' })
    expect(spy).toHaveBeenCalledTimes(2)
})

it('sin API de geolocalización devuelve no_soportado', async () => {
    vi.stubGlobal('navigator', {})

    const res = await capturarUbicacion()

    expect(res).toEqual({ ok: false, motivo: 'no_soportado' })
})
