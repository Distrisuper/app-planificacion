import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MapaVisita from './MapaVisita'

vi.mock('leaflet', () => {
    const map = {
        setView: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        fitBounds: vi.fn(),
        on: vi.fn(),
    }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    const circle = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
            circle: vi.fn(() => circle),
            divIcon: vi.fn(() => ({})),
        },
    }
})

function mockGeolocation(watchImpl: any, getCurrentImpl: any = () => {}) {
    const watchPosition = vi.fn(watchImpl)
    const getCurrentPosition = vi.fn(getCurrentImpl)
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition, getCurrentPosition, clearWatch } })
    return { watchPosition, getCurrentPosition, clearWatch }
}

beforeEach(() => vi.unstubAllGlobals())

it('no renderiza nada cuando está cerrado', () => {
    mockGeolocation((ok: any) => ok({ coords: { latitude: -34.6, longitude: -58.4 } }))
    render(
        <MapaVisita
            open={false}
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.queryByText('Kiosco Sur')).not.toBeInTheDocument()
})

it('muestra nombre, dirección y dispara onIniciar/onCancel', async () => {
    mockGeolocation((ok: any) => ok({ coords: { latitude: -34.6, longitude: -58.4 } }))
    const onIniciar = vi.fn()
    const onCancel = vi.fn()
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            direccion="Av. Siempre Viva 742"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={onIniciar}
            onCancel={onCancel}
        />,
    )

    expect(screen.getByText('Kiosco Sur')).toBeInTheDocument()
    expect(screen.getByText('Av. Siempre Viva 742')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onIniciar).toHaveBeenCalled()

    await userEvent.click(screen.getByLabelText('Cancelar'))
    expect(onCancel).toHaveBeenCalled()
})

it('deshabilita el botón mientras iniciando es true', () => {
    mockGeolocation((ok: any) => ok({ coords: { latitude: -34.6, longitude: -58.4 } }))
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            iniciando
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByRole('button', { name: /iniciando/i })).toBeDisabled()
})

it('si falla la ubicación en vivo, avisa que igual se puede iniciar', () => {
    mockGeolocation((_ok: any, fail: any) => fail())
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByText(/no pudimos ubicarte/i)).toBeInTheDocument()
})

it('deshabilita el botón y avisa cuando el fix propio está lejos y es preciso', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeDisabled()
})

it('mientras no llegó el primer fix, el botón queda deshabilitado (no habilitado por defecto)', () => {
    // watchPosition que nunca llama ni al éxito ni al error: simula la ventana real en la
    // que el GPS todavía está resolviendo (puede durar varios segundos con mala señal).
    mockGeolocation(() => {})
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByText(/calculando tu posición/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /calculando/i })).toBeDisabled()
})

it('no bloquea con un fix impreciso aunque marque lejos', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 500 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByRole('button', { name: /iniciar visita/i })).not.toBeDisabled()
})

it('si falla el recálculo pero ya había una posición conocida, no muestra el aviso contradictorio de "podés iniciar igual"', async () => {
    const { getCurrentPosition } = mockGeolocation(
        (ok: any) => ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
        (_ok: any, fail: any) => fail(),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )

    // Ya hay una posición conocida (lejos): el botón queda bloqueado con el aviso de distancia.
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /recalcular posición/i }))

    expect(getCurrentPosition).toHaveBeenCalled()
    // "No pudimos ubicarte, podés iniciar igual" es CONTRADICTORIO acá: ya sabemos que está
    // lejos (el botón sigue bloqueado), así que no debe convivir con ese aviso.
    expect(screen.queryByText(/no pudimos ubicarte/i)).not.toBeInTheDocument()
    expect(screen.getByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
})

it('limpia el watch de geolocalización al desmontar', () => {
    const { clearWatch, watchPosition } = mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4 } }),
    )
    watchPosition.mockReturnValue(42)
    const { unmount } = render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(42)
})

/** Devuelve el handler registrado con map.on('click', ...) en el render más reciente. */
async function getClickHandler() {
    const L = await import('leaflet')
    const mapMock = L.default.map as any
    // `L.map` siempre devuelve el mismo objeto `map` mock (no uno nuevo por llamada), y
    // los mocks no se resetean entre tests en este archivo: `map.on.mock.calls` acumula
    // un registro de 'click' por cada render de cada test. El último es el vigente.
    const map = mapMock.mock.results[mapMock.mock.results.length - 1].value
    const calls = map.on.mock.calls.filter((c: any) => c[0] === 'click')
    return calls[calls.length - 1][1] as (e: { latlng: { lat: number; lng: number } }) => void
}

it('arma el modo reposicionar, deshabilita Iniciar visita, y Cancelar lo desarma sin mover nada', async () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(await screen.findByRole('button', { name: /iniciar visita/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    expect(screen.getByText(/tocá el mapa para mover al cliente/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeDisabled()

    // "Cancelar reposición" (texto), no "Cancelar" (el aria-label del botón X del
    // header, que cierra TODO el mapa) — ver nota de accesibilidad en el Step 9.
    await userEvent.click(screen.getByRole('button', { name: /cancelar reposición/i }))
    expect(screen.queryByText(/tocá el mapa para mover al cliente/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeEnabled()
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
})

it('reposicionar mueve el pin, recalcula sin esperar un nuevo fix, y avisa el ajuste', async () => {
    const onReposicionar = vi.fn()
    // Fix del vendedor lejos del cliente original (mismo par usado en el test de
    // "acercate a menos de 100 m" ya existente): bloquea al abrir.
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    // Reposiciona EXACTO donde está el vendedor: distancia pasa a 0.
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })

    expect(onReposicionar).toHaveBeenCalledWith({ lat: -34.603, lng: -58.4 })
    expect(await screen.findByText(/posición ajustada para esta visita/i)).toBeInTheDocument()
    expect(screen.queryByText(/acercate a menos de 100 m/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^iniciar visita$/i })).toBeEnabled()
})

it('un click en el mapa SIN haber armado el modo no mueve nada', async () => {
    const onReposicionar = vi.fn()
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    await screen.findByRole('button', { name: /^iniciar visita$/i })
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.7, lng: -58.5 } })

    expect(onReposicionar).not.toHaveBeenCalled()
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
})

it('Restablecer vuelve a la coordenada original y avisa onReposicionar(null)', async () => {
    const onReposicionar = vi.fn()
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.603, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
            onReposicionar={onReposicionar}
        />,
    )
    await screen.findByText(/acercate a menos de 100 m/i)
    await userEvent.click(screen.getByRole('button', { name: /reposicionar cliente/i }))
    const handleClick = await getClickHandler()
    handleClick({ latlng: { lat: -34.603, lng: -58.4 } })
    await screen.findByText(/posición ajustada para esta visita/i)

    await userEvent.click(screen.getByRole('button', { name: /restablecer/i }))

    expect(onReposicionar).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText(/posición ajustada/i)).not.toBeInTheDocument()
    // Vuelve a estar bloqueado: la coordenada original seguía lejos del vendedor.
    expect(await screen.findByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
})

it('Recalcular posición no exige una lectura estrictamente nueva (maximumAge > 0)', async () => {
    // `maximumAge: 0` prohíbe reusar cualquier fix ya resuelto por el navegador. En
    // equipos sin GPS (una PC de escritorio) el proveedor de ubicación por red resuelve
    // UNA vez y no puede producir otra a pedido — mismo motivo por el que
    // `capturarUbicacion()` tampoco usa 0 (ver src/lib/geolocation.ts). Sin esta
    // tolerancia, "Recalcular posición" queda cargando hasta agotar el timeout y termina
    // siempre en "No pudimos actualizar tu posición", aun cuando el vendedor no se movió.
    const { getCurrentPosition } = mockGeolocation(
        (ok: any) => ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )

    await userEvent.click(screen.getByRole('button', { name: /recalcular posición/i }))

    const opciones = getCurrentPosition.mock.calls.at(-1)?.[2] as PositionOptions
    expect(opciones.maximumAge).toBeGreaterThan(0)
})

it('en modo consulta no ofrece iniciar ni reposicionar', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCancel={() => {}}
        />,
    )

    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reposicionar/i })).not.toBeInTheDocument()
    // Lo que sí tiene que seguir estando: la medición.
    expect(screen.getByRole('button', { name: /recalcular posición/i })).toBeInTheDocument()
})

it('en modo consulta el encabezado dice "Tu posición"', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 } }),
    )
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onCancel={() => {}}
        />,
    )

    expect(screen.getByText('Tu posición')).toBeInTheDocument()
    expect(screen.queryByText('Iniciar visita')).not.toBeInTheDocument()
})

it('avisa cada fix del watch por onFix, con la precisión', () => {
    mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.601, longitude: -58.401, accuracy: 12 } }),
    )
    const onFix = vi.fn()
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onFix={onFix}
            onCancel={() => {}}
        />,
    )

    expect(onFix).toHaveBeenCalledWith(-34.601, -58.401, 12)
})

it('avisa por onFix también al recalcular', async () => {
    mockGeolocation(
        () => {},
        (ok: any) => ok({ coords: { latitude: -34.602, longitude: -58.402, accuracy: 8 } }),
    )
    const onFix = vi.fn()
    render(
        <MapaVisita
            open
            modo="consulta"
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onFix={onFix}
            onCancel={() => {}}
        />,
    )

    await userEvent.click(screen.getByRole('button', { name: /recalcular posición/i }))

    expect(onFix).toHaveBeenCalledWith(-34.602, -58.402, 8)
})
