import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import DetalleVisitaPanel from './DetalleVisitaPanel'
import * as api from '@/api/analitica'
import type { IVisitaDetalle } from '@/types/analitica'

vi.mock('@/api/analitica')
// Leaflet no dibuja en jsdom: el mapa se prueba a mano en el navegador.
vi.mock('./MapaVisita', () => ({ default: () => <div data-testid="mapa" /> }))

const DETALLE: IVisitaDetalle = {
    visitaId: 1000,
    codigoParticularCliente: 'C1',
    nombreCliente: 'OSANO ALDO MARIO',
    direccion: 'Av. Pellegrini 1200',
    fechaInicio: '2026-07-20T09:13:00',
    fechaFin: '2026-07-20T09:58:00',
    duracionMin: 45,
    coordInicio: { lat: -32.9442, lng: -60.6505 },
    coordFinal: { lat: -32.9443, lng: -60.6506 },
    coordCliente: { lat: -32.9441, lng: -60.6504 },
    distanciaMetros: 29,
    ofrecimientos: [
        {
            tipo: 'rubro',
            codigo: 'R01',
            descripcion: 'Lubricantes',
            esPropuesto: true,
            resuelto: true,
            alcance: [],
            motivos: [
                {
                    descripcion: 'Precio',
                    resultado: 'perdido',
                    marca: 'YPF',
                    competidor: 'Shell',
                    pctDiferencia: 12,
                },
            ],
        },
        {
            tipo: 'rubro',
            codigo: 'R02',
            descripcion: 'Filtros',
            esPropuesto: true,
            resuelto: false,
            alcance: [],
            motivos: [],
        },
        {
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            esPropuesto: false,
            resuelto: true,
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
            motivos: [
                { descripcion: 'Saqué pedido', resultado: 'ganado', marca: null, competidor: null, pctDiferencia: null },
            ],
        },
    ],
}

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <DetalleVisitaPanel visitaId={1000} onCerrar={cerrar} />
        </QueryClientProvider>,
    )
}

const cerrar = vi.fn()

beforeEach(() => vi.clearAllMocks())

it('muestra el cliente, el horario y la duración', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('OSANO ALDO MARIO')).toBeInTheDocument())
    expect(screen.getByText('45 min')).toBeInTheDocument()
})

it('muestra el detalle del motivo con marca, competidor y diferencia', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('Lubricantes')).toBeInTheDocument())
    expect(screen.getByText(/YPF/)).toBeInTheDocument()
    expect(screen.getByText(/Shell/)).toBeInTheDocument()
    expect(screen.getByText(/12%/)).toBeInTheDocument()
})

it('marca los rubros que quedaron sin resolver', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('Filtros')).toBeInTheDocument())
    expect(screen.getByTestId('ofrecimiento-rubro-R02')).toHaveTextContent(/sin resolver/i)
})

it('muestra el tipo y el alcance de un ofrecimiento que no es rubro', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('Plan cupo')).toBeInTheDocument())
    expect(screen.getByText('Acción')).toBeInTheDocument()
    expect(screen.getByText('SKF')).toBeInTheDocument()
})

it('no dibuja el mapa si el cliente no tiene coords', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue({
        ...DETALLE,
        coordCliente: null,
        distanciaMetros: null,
    })
    montar()
    await waitFor(() => expect(screen.getByText(/sin coordenadas del cliente/i)).toBeInTheDocument())
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument()
})

it('se cierra con el botón', async () => {
    ;(api.getVisitaDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('OSANO ALDO MARIO')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(cerrar).toHaveBeenCalled()
})
