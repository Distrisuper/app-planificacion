import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import IniciarVisitaMapa from './IniciarVisitaMapa'

vi.mock('leaflet', () => {
    const map = {
        setView: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        fitBounds: vi.fn(),
    }
    const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn() }
    const tileLayer = { addTo: vi.fn() }
    const circle = { addTo: vi.fn().mockReturnThis() }
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

function mockGeolocation(impl: any) {
    const watchPosition = vi.fn(impl)
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })
    return { watchPosition, clearWatch }
}

beforeEach(() => vi.unstubAllGlobals())

it('no renderiza nada cuando está cerrado', () => {
    mockGeolocation((ok: any) => ok({ coords: { latitude: -34.6, longitude: -58.4 } }))
    render(
        <IniciarVisitaMapa
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
        <IniciarVisitaMapa
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
        <IniciarVisitaMapa
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
        <IniciarVisitaMapa
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
        <IniciarVisitaMapa
            open
            nombreCliente="Kiosco Sur"
            latitud={-34.6}
            longitud={-58.4}
            onIniciar={() => {}}
            onCancel={() => {}}
        />,
    )
    expect(screen.getByText(/acercate a menos de 100 m/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acercate al cliente/i })).toBeDisabled()
})

it('mientras no llegó el primer fix, el botón queda deshabilitado (no habilitado por defecto)', () => {
    // watchPosition que nunca llama ni al éxito ni al error: simula la ventana real en la
    // que el GPS todavía está resolviendo (puede durar varios segundos con mala señal).
    mockGeolocation(() => {})
    render(
        <IniciarVisitaMapa
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
        <IniciarVisitaMapa
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

it('limpia el watch de geolocalización al desmontar', () => {
    const { clearWatch, watchPosition } = mockGeolocation((ok: any) =>
        ok({ coords: { latitude: -34.6, longitude: -58.4 } }),
    )
    watchPosition.mockReturnValue(42)
    const { unmount } = render(
        <IniciarVisitaMapa
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
