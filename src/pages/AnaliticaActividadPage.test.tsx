import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaActividadPage from './AnaliticaActividadPage'
import { MOCK_RESUMEN, MOCK_VENDEDORES } from '@/mocks/analiticaMock'
import { isoLocal } from '@/lib/fechas'
import * as api from '@/api/analitica'
import type { IVisitaFila } from '@/types/analitica'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

const FILA: IVisitaFila = {
    visitaId: 1,
    fecha: '2026-08-03',
    fechaInicio: '2026-08-03T12:15:00Z',
    fechaFin: null,
    duracionMin: null,
    distanciaInicioMetros: 80,
    distanciaFinMetros: 60,
    codigoParticularCliente: 'C1000',
    nombreCliente: 'CALDERON ALEJANDRO PABLO',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    tipo: 'visita',
    motivos: [],
    resultado: null,
}

function montar(ruta = '/analitica/actividad') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaActividadPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    ;(api.getVisitas as any).mockResolvedValue({
        total: 1,
        pagina: 1,
        cant: 1,
        visitas: [FILA],
    })
})

it('sin rango en la URL arranca en hoy', async () => {
    montar()
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    const hoy = isoLocal(new Date())
    expect((api.getVisitas as any).mock.calls[0][0]).toMatchObject({ desde: hoy, hasta: hoy })
})

it('pide el listado sin vendedor: es la vista del equipo', async () => {
    montar()
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    expect((api.getVisitas as any).mock.calls[0][0].vendedor).toBeUndefined()
})

it('muestra las filas con su vendedor', async () => {
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByText('CALDERON ALEJANDRO PABLO')).toBeInTheDocument()
})

it('respeta el rango de la URL', async () => {
    montar('/analitica/actividad?desde=2026-07-20&hasta=2026-07-24')
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    expect((api.getVisitas as any).mock.calls[0][0]).toMatchObject({
        desde: '2026-07-20',
        hasta: '2026-07-24',
    })
})

it('sin actividad muestra un vacío explícito', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByText(/sin actividad/i)).toBeInTheDocument())
})
