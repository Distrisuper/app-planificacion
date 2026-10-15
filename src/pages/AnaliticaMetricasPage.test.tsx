import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaMetricasPage from './AnaliticaMetricasPage'
import { MOCK_RESUMEN, MOCK_TELEVENDEDORES, MOCK_VENDEDORES } from '@/mocks/analiticaMock'
import {
    MOCK_OBJECIONES_POR_PERSONA,
    MOCK_PRODUCTIVIDAD_TV,
    MOCK_RUBROS,
    MOCK_VENTAS_VENDEDORES,
} from '@/mocks/metricasEquipoMock'
import * as api from '@/api/analitica'
import * as apiEquipo from '@/api/metricasEquipo'

vi.mock('@/api/analitica')
vi.mock('@/api/metricasEquipo')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

function montar(ruta = '/analitica/metricas') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaMetricasPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    ;(api.getTelevendedores as any).mockResolvedValue(MOCK_TELEVENDEDORES)
    ;(api.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
    ;(apiEquipo.getProductividadTv as any).mockResolvedValue(MOCK_PRODUCTIVIDAD_TV)
    ;(apiEquipo.getObjecionesPorPersona as any).mockResolvedValue(MOCK_OBJECIONES_POR_PERSONA)
    ;(apiEquipo.getVentasVendedores as any).mockResolvedValue(MOCK_VENTAS_VENDEDORES)
    ;(apiEquipo.getRubrosCatalogo as any).mockResolvedValue(MOCK_RUBROS)
})

const pulsar = (nombre: string) => fireEvent.click(screen.getByRole('button', { name: nombre }))

describe('Productividad (vista por defecto)', () => {
    it('lista vendedores y TV juntos, cada uno con su tipo', async () => {
        montar()
        const ana = await screen.findByTestId('fila-productividad-9001')
        expect(within(ana).getByText('FARMER')).toBeInTheDocument()
        expect(within(ana).getByText('llamados')).toBeInTheDocument()
        expect(within(screen.getByTestId('fila-productividad-9002')).getByText('HUNTER')).toBeInTheDocument()
        const v1 = await screen.findByTestId('fila-productividad-V1')
        expect(within(v1).getByText('VENDEDOR')).toBeInTheDocument()
        expect(within(v1).getByText('visitas válidas')).toBeInTheDocument()
        // Sin perfil ni nombre: se ve el código.
        expect(within(screen.getByTestId('fila-productividad-9004')).getByText('TV SIN PERFIL')).toBeInTheDocument()
    })

    it('pide las dos fuentes con el mismo rango', async () => {
        montar()
        await screen.findByTestId('fila-productividad-9001')
        const { desde, hasta } = (api.getResumen as any).mock.calls[0][0]
        expect(apiEquipo.getProductividadTv).toHaveBeenCalledWith({ desde, hasta })
    })

    it('el filtro de tipo deja solo a los de ese tipo', async () => {
        montar()
        await screen.findByTestId('fila-productividad-V1')
        pulsar('Farmer')
        expect(screen.getByTestId('fila-productividad-9001')).toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-V1')).not.toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-9002')).not.toBeInTheDocument()
    })

    it('si falla Televentas, los vendedores se siguen viendo', async () => {
        ;(apiEquipo.getProductividadTv as any).mockRejectedValue(new Error('404'))
        montar()
        expect(await screen.findByTestId('fila-productividad-V1')).toBeInTheDocument()
        expect(await screen.findByText('No se pudieron cargar los llamados de Televentas.')).toBeInTheDocument()
    })
})

describe('Ranking de objeciones', () => {
    it('la tarjeta muestra 6 motivos y pliega el resto', async () => {
        montar('/analitica/metricas?vista=objeciones')
        expect(await screen.findByTestId('motivo-1')).toBeInTheDocument()
        expect(screen.getByTestId('total-objeciones')).toHaveTextContent(String(MOCK_OBJECIONES_POR_PERSONA.total))
        const masAllaDeSeis = MOCK_OBJECIONES_POR_PERSONA.motivos[6]
        expect(screen.queryByTestId(`motivo-${masAllaDeSeis.motivoId}`)).not.toBeInTheDocument()
        pulsar('Ver 2 motivos más')
        expect(screen.getByTestId(`motivo-${masAllaDeSeis.motivoId}`)).toBeInTheDocument()
    })

    it('cada persona con su tipo; tocar un motivo ordena por quién más lo registra', async () => {
        montar('/analitica/metricas?vista=objeciones')
        const filas = async () => (await screen.findAllByTestId(/^fila-objeciones-/)).map(f => f.dataset.testid)
        // Por total: V1 primero.
        expect((await filas())[0]).toBe('fila-objeciones-V1')
        expect(within(screen.getByTestId('fila-objeciones-9002')).getByText('HUNTER')).toBeInTheDocument()

        // "Pasa pedido" (2): V1 31, V2 27, 9002 22, 9001 17…
        fireEvent.click(screen.getByTestId('motivo-2'))
        expect(screen.getByRole('heading', { name: 'Ranking · Pasa pedido' })).toBeInTheDocument()
        expect((await filas()).slice(0, 4)).toEqual([
            'fila-objeciones-V1', 'fila-objeciones-V2', 'fila-objeciones-9002', 'fila-objeciones-9001',
        ])
        // "No trabaja la marca o cambió" (4): el hunter 9002 (11) le gana a V1 (9).
        fireEvent.click(screen.getByTestId('motivo-4'))
        expect((await filas())[0]).toBe('fila-objeciones-9002')
    })

    it('con un tipo, la tarjeta recuenta solo las objeciones de ese tipo', async () => {
        montar('/analitica/metricas?vista=objeciones&tipo=farmer')
        const farmer = MOCK_OBJECIONES_POR_PERSONA.personas.find(p => p.tipo === 'farmer')!
        expect(await screen.findByTestId('total-objeciones')).toHaveTextContent(`${farmer.total} objeciones · 1 persona`)
        expect(screen.queryByTestId('fila-objeciones-V1')).not.toBeInTheDocument()
    })

    it('el rubro viaja al backend', async () => {
        montar('/analitica/metricas?vista=objeciones')
        await screen.findByTestId('motivo-1')
        await screen.findByRole('option', { name: 'Filtros' })
        fireEvent.change(screen.getByLabelText('Rubro'), { target: { value: '12' } })
        await waitFor(() =>
            expect(apiEquipo.getObjecionesPorPersona).toHaveBeenLastCalledWith(expect.objectContaining({ rubro: '12' })),
        )
    })
})

describe('Facturación', () => {
    it('el tipo de la cartera: VENDEDOR si es de calle, más el perfil de cada TV que la atiende', async () => {
        montar('/analitica/metricas?vista=facturacion')
        // Solo de Televentas: farmer y hunter, sin VENDEDOR.
        const tv1 = await screen.findByTestId('fila-facturacion-CARTERA TV1')
        await waitFor(() => expect(within(tv1).getByText('FARMER')).toBeInTheDocument())
        expect(within(tv1).getByText('HUNTER')).toBeInTheDocument()
        expect(within(tv1).queryByText('VENDEDOR')).not.toBeInTheDocument()
        // V9 es de un vendedor de calle y además la atiende un farmer: los dos.
        const v9 = screen.getByTestId('fila-facturacion-V9')
        await waitFor(() => expect(within(v9).getByText('VENDEDOR')).toBeInTheDocument())
        expect(within(v9).getByText('FARMER')).toBeInTheDocument()
        expect(within(screen.getByTestId('fila-facturacion-V1')).getByText('VENDEDOR')).toBeInTheDocument()
        // V8 la tenía un TV inactivo: hoy es de un vendedor.
        expect(within(screen.getByTestId('fila-facturacion-V8')).getByText('VENDEDOR')).toBeInTheDocument()
    })

    it('con un backend sin carteras no inventa el tipo', async () => {
        ;(api.getTelevendedores as any).mockResolvedValue(
            MOCK_TELEVENDEDORES.map(({ codigoParticularTv, nombreTv, activo }) => ({ codigoParticularTv, nombreTv, activo })),
        )
        montar('/analitica/metricas?vista=facturacion')
        const v1 = await screen.findByTestId('fila-facturacion-V1')
        await waitFor(() => expect(within(v1).getByText('Sin tipo')).toBeInTheDocument())
        expect(within(v1).queryByText('VENDEDOR')).not.toBeInTheDocument()
    })

    it('TOTALES suma las carteras; U / $ / SR cambian lo que se lee', async () => {
        montar('/analitica/metricas?vista=facturacion')
        const totales = await screen.findByTestId('fila-totales')
        const sumaMes = MOCK_VENTAS_VENDEDORES.reduce((s, v) => s + v.totalsByPeriod.thisMonth!.amount, 0)
        expect(totales).toHaveTextContent(new Intl.NumberFormat('es-AR').format(Math.round(sumaMes)))

        pulsar('U')
        const unidades = MOCK_VENTAS_VENDEDORES.reduce((s, v) => s + v.totalsByPeriod.thisMonth!.units, 0)
        expect(screen.getByTestId('fila-totales')).toHaveTextContent(new Intl.NumberFormat('es-AR').format(unidades))
    })

    it('ordena por P.6M de mayor a menor de entrada, y la columna se puede invertir', async () => {
        montar('/analitica/metricas?vista=facturacion')
        await screen.findByTestId('fila-facturacion-V1')
        const orden = () => screen.getAllByTestId(/^fila-facturacion-/).map(f => f.dataset.testid)
        expect(orden()[0]).toBe('fila-facturacion-V1')
        expect(orden().at(-1)).toBe('fila-facturacion-V8')
        fireEvent.click(screen.getByRole('button', { name: /P\.6M/ }))
        expect(orden()[0]).toBe('fila-facturacion-V8')
    })

    it('la cartera de un vendedor atendida por un TV aparece con los dos filtros', async () => {
        montar('/analitica/metricas?vista=facturacion&tipo=vendedor')
        expect(await screen.findByTestId('fila-facturacion-V9')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByTestId('fila-facturacion-CARTERA TV1')).not.toBeInTheDocument())
    })

    it('el filtro de tipo deja solo las carteras de ese perfil', async () => {
        montar('/analitica/metricas?vista=facturacion&tipo=hunter')
        expect(await screen.findByTestId('fila-facturacion-CARTERA TV1')).toBeInTheDocument()
        await waitFor(() => expect(screen.getAllByTestId(/^fila-facturacion-/)).toHaveLength(1))
    })

    it('PROY cambia el encabezado del mes', async () => {
        montar('/analitica/metricas?vista=facturacion')
        await screen.findByTestId('fila-facturacion-V1')
        pulsar('PROY')
        expect(screen.getByRole('button', { name: /^PROY/ , pressed: true })).toBeInTheDocument()
        expect(screen.getByText(/días hábiles\)/)).toBeInTheDocument()
    })

    it('no muestra el selector de período: sus columnas son fijas', async () => {
        montar('/analitica/metricas?vista=facturacion')
        await screen.findByTestId('fila-facturacion-V1')
        expect(screen.queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
    })
})

it('las sub-pestañas cambian la vista', async () => {
    montar()
    await screen.findByTestId('fila-productividad-V1')
    pulsar('Facturación')
    expect(await screen.findByTestId('fila-facturacion-V1')).toBeInTheDocument()
    pulsar('Ranking de objeciones')
    expect(await screen.findByTestId('motivo-1')).toBeInTheDocument()
})
