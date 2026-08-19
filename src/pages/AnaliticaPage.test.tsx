import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaPage from './AnaliticaPage'
import { MOCK_RESUMEN, MOCK_VENDEDORES } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'
import type { IAnaliticaFiltro, IAnaliticaResumen } from '@/types/analitica'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

function montar(ruta = '/analitica?desde=2026-07-20&hasta=2026-07-24') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

/** El resumen "completo" (con MOCK_RESUMEN.vendedores) solo se devuelve para el
 *  filtro de la página bajo prueba. Cualquier otro filtro —el que arma
 *  EfectividadOperativaSection con el mes en curso, que no se puede predecir en un
 *  test— recibe un resumen vacío. Así ningún nombre de vendedor queda duplicado en
 *  pantalla y los `getByText` existentes no se rompen. */
function mockResumenSoloParaFiltroPrincipal(
    resultado: IAnaliticaResumen,
    desde = '2026-07-20',
    hasta = '2026-07-24',
) {
    ;(api.getResumen as any).mockImplementation((filtro: IAnaliticaFiltro) =>
        Promise.resolve(
            filtro.desde === desde && filtro.hasta === hasta
                ? resultado
                : { desde: filtro.desde, hasta: filtro.hasta, diasHabiles: 0, promedios: MOCK_RESUMEN.promedios, vendedores: [] },
        ),
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    ;(api.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
})

it('muestra la tabla con los vendedores del resumen', async () => {
    mockResumenSoloParaFiltroPrincipal(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByText('PROMEDIOS')).toBeInTheDocument()
})

it('sin ciclos en el rango muestra un vacío explícito, no un 0%', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        desde: '2020-01-01',
        hasta: '2020-01-05',
        diasHabiles: 5,
        promedios: { ...MOCK_RESUMEN.promedios, cobertura: null },
        vendedores: [],
    })
    montar('/analitica?desde=2020-01-01&hasta=2020-01-05')
    await waitFor(() =>
        expect(screen.getByText(/no hay ciclos entre/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
})

it('muestra el error si el resumen falla', async () => {
    ;(api.getResumen as any).mockRejectedValue(new Error('boom'))
    montar()
    await waitFor(() => expect(screen.getAllByText(/no se pudo cargar/i).length).toBeGreaterThan(0))
})

it('el dropdown muestra el roster completo, incluido un vendedor sin actividad', async () => {
    mockResumenSoloParaFiltroPrincipal({
        ...MOCK_RESUMEN,
        vendedores: MOCK_RESUMEN.vendedores.filter(v => v.codigoParticularVendedor === 'V1'),
    })
    montar('/analitica?desde=2026-07-20&hasta=2026-07-24&vendedores=V1')
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /vendedores/i }))
    for (const v of MOCK_VENDEDORES) {
        expect(screen.getByLabelText(v.nombreVendedor)).toBeInTheDocument()
    }
})

it('muestra la sección de efectividad operativa con su propio selector de mes', async () => {
    mockResumenSoloParaFiltroPrincipal(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Efectividad operativa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
})
