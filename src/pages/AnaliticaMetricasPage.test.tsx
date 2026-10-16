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
import { cantidadDe } from '@/lib/objecionesEquipo'
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
    it('arranca en Vendedor, sin TV mezclados y sin etiquetas de tipo', async () => {
        montar()
        const v1 = await screen.findByTestId('fila-productividad-V1')
        expect(within(v1).getByText('visitas válidas')).toBeInTheDocument()
        expect(within(v1).queryByText('VENDEDOR')).not.toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-9001')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Vendedor', pressed: true })).toBeInTheDocument()
    })

    it('no hay opción "Todos": vendedor y TV no se mezclan, ni con la URL vieja', async () => {
        montar('/analitica/metricas?tipo=todos')
        await screen.findByTestId('fila-productividad-V1')
        expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-9001')).not.toBeInTheDocument()
    })

    it('con un perfil de TV quedan solo esos TV, sin etiqueta', async () => {
        montar('/analitica/metricas?tipo=farmer')
        const ana = await screen.findByTestId('fila-productividad-9001')
        expect(within(ana).getByText('llamados')).toBeInTheDocument()
        expect(within(ana).queryByText('FARMER')).not.toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-9002')).not.toBeInTheDocument()
        expect(screen.queryByTestId('fila-productividad-V1')).not.toBeInTheDocument()
    })

    it('las columnas son Objetivo, Logrado y Cumplimiento: la meta, lo hecho y el % de lo hecho', async () => {
        montar()
        await screen.findByTestId('fila-productividad-V1')
        const encabezados = screen.getAllByRole('columnheader').map(th => th.textContent)
        expect(encabezados).toEqual(['', 'Persona', 'Objetivo', 'Logrado', 'Cumplimiento'])
        // V1: 40 visitas válidas al 104% → objetivo ≈ 38.
        const v1 = within(screen.getByTestId('fila-productividad-V1'))
        expect(v1.getAllByRole('cell').slice(2).map(c => c.textContent)).toEqual(['38', '40visitas válidas', '104%'])
        // El TV 9001: 81 llamados contra 75 de objetivo.
        pulsar('Farmer')
        const ana = within(await screen.findByTestId('fila-productividad-9001'))
        expect(ana.getAllByRole('cell').slice(2).map(c => c.textContent)).toEqual(['75', '81llamados', '108%'])
    })

    it('debajo del nombre, el código se ve en el TV pero no en el vendedor', async () => {
        montar()
        expect(within(await screen.findByTestId('fila-productividad-V1')).queryByText('V1')).not.toBeInTheDocument()
        pulsar('Farmer')
        expect(within(await screen.findByTestId('fila-productividad-9001')).getByText('9001')).toBeInTheDocument()
    })

    it('con Día pide las dos fuentes para un solo día', async () => {
        montar()
        await screen.findByTestId('fila-productividad-V1')
        pulsar('Día')
        await waitFor(() => {
            const { desde, hasta } = (apiEquipo.getProductividadTv as any).mock.lastCall[0]
            expect(desde).toBe(hasta)
        })
        const { desde, hasta } = (api.getResumen as any).mock.lastCall[0]
        expect(desde).toBe(hasta)
    })

    it('una ayuda explica cómo sale el objetivo de cada uno, según el período', async () => {
        montar()
        await screen.findByTestId('fila-productividad-V1')
        fireEvent.click(screen.getByRole('button', { name: 'Cómo se calcula el objetivo' }))
        const ayuda = await screen.findByRole('dialog')
        expect(ayuda).toHaveTextContent(/clientes de sus carteras/i)
        expect(ayuda).toHaveTextContent(/según su meta diaria/i)
        // El día del TV es su meta fija; la semana, la meta por sus días hábiles.
        expect(ayuda).toHaveTextContent(/Día: su meta diaria \(15 Farmer, 35 Hunter\)/)
        expect(ayuda).toHaveTextContent(/Semana: la meta diaria por los días hábiles de la semana/)
    })

    it('pide las dos fuentes con el mismo rango', async () => {
        montar()
        await screen.findByTestId('fila-productividad-V1')
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

    it('si falla Televentas, los vendedores se siguen viendo y el aviso sale al pasar a un perfil de TV', async () => {
        ;(apiEquipo.getProductividadTv as any).mockRejectedValue(new Error('404'))
        montar()
        expect(await screen.findByTestId('fila-productividad-V1')).toBeInTheDocument()
        pulsar('Farmer')
        expect(await screen.findByText('No se pudieron cargar los llamados de Televentas.')).toBeInTheDocument()
    })
})

describe('Ranking de objeciones', () => {
    it('la tarjeta muestra 6 motivos de los vendedores y pliega el resto', async () => {
        montar('/analitica/metricas?vista=objeciones')
        expect(await screen.findByTestId('motivo-2')).toBeInTheDocument()
        const deVendedores = MOCK_OBJECIONES_POR_PERSONA.personas.filter(p => p.tipo === 'vendedor')
        // Sin "No lo ofrecí" (motivo 1).
        const total = deVendedores.reduce((s, p) => s + p.total - cantidadDe(p, 1), 0)
        expect(screen.getByTestId('total-objeciones')).toHaveTextContent(`${total} objeciones · ${deVendedores.length} personas`)
        // Entre los vendedores, "8" es el menos registrado.
        expect(screen.queryByTestId('motivo-8')).not.toBeInTheDocument()
        pulsar('Ver 1 motivo más')
        expect(screen.getByTestId('motivo-8')).toBeInTheDocument()
    })

    it('"No lo ofrecí" no aparece: ni en la tarjeta, ni en la tabla, ni como principal', async () => {
        montar('/analitica/metricas?vista=objeciones')
        await screen.findByTestId('motivo-2')
        expect(screen.queryByTestId('motivo-1')).not.toBeInTheDocument()
        expect(screen.queryByText('No lo ofrecí')).not.toBeInTheDocument()
    })

    it('sin etiquetas de tipo; tocar un motivo ordena por quién más lo registra', async () => {
        montar('/analitica/metricas?vista=objeciones')
        const filas = async () => (await screen.findAllByTestId(/^fila-objeciones-/)).map(f => f.dataset.testid)
        // Por total: V1 primero, y ningún TV.
        expect((await filas())[0]).toBe('fila-objeciones-V1')
        expect(screen.queryByTestId('fila-objeciones-9002')).not.toBeInTheDocument()
        expect(within(screen.getByTestId('fila-objeciones-V1')).queryByText('VENDEDOR')).not.toBeInTheDocument()

        // "Pasa pedido" (2): V1 31, V2 27, V3 14, V4 7.
        fireEvent.click(screen.getByTestId('motivo-2'))
        expect(screen.getByRole('heading', { name: 'Ranking · Pasa pedido' })).toBeInTheDocument()
        expect(await filas()).toEqual([
            'fila-objeciones-V1', 'fila-objeciones-V2', 'fila-objeciones-V3', 'fila-objeciones-V4',
        ])
        // "No trabaja la marca o cambió" (4): V1 9, V4 2.
        fireEvent.click(screen.getByTestId('motivo-4'))
        expect((await filas()).slice(0, 2)).toEqual(['fila-objeciones-V1', 'fila-objeciones-V4'])
    })

    it('cambiar de tipo no repinta los motivos: cada uno conserva su color', async () => {
        montar('/analitica/metricas?vista=objeciones')
        const color = async (id: number) => (await screen.findByTestId(`motivo-${id}`)).style.borderLeftColor
        const antes = await color(2)
        expect(antes).not.toBe('')
        // Con Farmer, "Pasa pedido" (2) pasa a ser el primero del recorte.
        pulsar('Farmer')
        await waitFor(() => expect(screen.getByTestId('total-objeciones')).toHaveTextContent('1 persona'))
        expect(await color(2)).toBe(antes)
    })

    it('en el ranking, el código se ve debajo del TV pero no del vendedor', async () => {
        montar('/analitica/metricas?vista=objeciones')
        expect(within(await screen.findByTestId('fila-objeciones-V1')).queryByText('V1')).not.toBeInTheDocument()
        pulsar('Hunter')
        expect(within(await screen.findByTestId('fila-objeciones-9002')).getByText('9002')).toBeInTheDocument()
    })

    it('con un tipo, la tarjeta recuenta solo las objeciones de ese tipo', async () => {
        montar('/analitica/metricas?vista=objeciones&tipo=farmer')
        const farmer = MOCK_OBJECIONES_POR_PERSONA.personas.find(p => p.tipo === 'farmer')!
        const objeciones = farmer.total - cantidadDe(farmer, 1)
        expect(await screen.findByTestId('total-objeciones')).toHaveTextContent(`${objeciones} objeciones · 1 persona`)
        expect(screen.queryByTestId('fila-objeciones-V1')).not.toBeInTheDocument()
    })

    it('el rubro viaja al backend', async () => {
        montar('/analitica/metricas?vista=objeciones')
        await screen.findByTestId('motivo-2')
        await screen.findByRole('option', { name: 'Filtros' })
        fireEvent.change(screen.getByLabelText('Rubro'), { target: { value: '12' } })
        await waitFor(() =>
            expect(apiEquipo.getObjecionesPorPersona).toHaveBeenLastCalledWith(expect.objectContaining({ rubro: '12' })),
        )
    })
})

describe('Facturación', () => {
    it('arranca en Vendedor: las carteras de calle (aunque las atienda un TV), sin etiquetas de tipo', async () => {
        montar('/analitica/metricas?vista=facturacion')
        // V9 es de un vendedor de calle y además la atiende un farmer; V8 la tenía un TV inactivo.
        const v9 = await screen.findByTestId('fila-facturacion-V9')
        expect(screen.getByTestId('fila-facturacion-V1')).toBeInTheDocument()
        expect(screen.getByTestId('fila-facturacion-V8')).toBeInTheDocument()
        // Solo de Televentas: no entra.
        await waitFor(() => expect(screen.queryByTestId('fila-facturacion-CARTERA TV1')).not.toBeInTheDocument())
        expect(within(v9).queryByText('VENDEDOR')).not.toBeInTheDocument()
        expect(within(v9).queryByText('FARMER')).not.toBeInTheDocument()
    })

    it('con un backend sin carteras no inventa el tipo: avisa que no está disponible', async () => {
        ;(api.getTelevendedores as any).mockResolvedValue(
            MOCK_TELEVENDEDORES.map(({ codigoParticularTv, nombreTv, activo }) => ({ codigoParticularTv, nombreTv, activo })),
        )
        montar('/analitica/metricas?vista=facturacion')
        expect(await screen.findByText('El tipo de las carteras todavía no está disponible.')).toBeInTheDocument()
        expect(screen.queryByTestId('fila-facturacion-V1')).not.toBeInTheDocument()
    })

    it('TOTALES suma las carteras del filtro; U / $ / SR cambian lo que se lee', async () => {
        montar('/analitica/metricas?vista=facturacion')
        await waitFor(() => expect(screen.queryByTestId('fila-facturacion-CARTERA TV1')).not.toBeInTheDocument())
        const totales = await screen.findByTestId('fila-totales')
        const deVendedores = MOCK_VENTAS_VENDEDORES.filter(v => v.code !== 'CARTERA TV1')
        const sumaMes = deVendedores.reduce((s, v) => s + v.totalsByPeriod.thisMonth!.amount, 0)
        expect(totales).toHaveTextContent(new Intl.NumberFormat('es-AR').format(Math.round(sumaMes)))

        pulsar('U')
        const unidades = deVendedores.reduce((s, v) => s + v.totalsByPeriod.thisMonth!.units, 0)
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
    expect(await screen.findByTestId('motivo-2')).toBeInTheDocument()
})
