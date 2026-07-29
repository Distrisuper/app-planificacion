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
    return {
        default: {
            map: vi.fn(() => map),
            tileLayer: vi.fn(() => tileLayer),
            marker: vi.fn(() => marker),
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
