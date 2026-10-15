import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaActividadPage from './AnaliticaActividadPage'
import AnaliticaVendedorPage from './AnaliticaVendedorPage'
import { MOCK_RESUMEN, MOCK_VENDEDORES } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'
import type { IContactoLlamado, IContactoVisita, IContactosPage } from '@/types/analitica'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

const VISITA: IContactoVisita = {
    canal: 'visita',
    visitaId: 1,
    fecha: '2026-07-20',
    fechaInicio: '2026-07-20T12:15:00Z',
    fechaFin: '2026-07-20T12:55:00Z',
    duracionMin: 40,
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

const LLAMADO: IContactoLlamado = {
    canal: 'llamado',
    llamadoId: 9,
    tipo: 'atendido',
    estado: 'venta',
    fecha: '2026-07-20',
    fechaInicio: '2026-07-20T18:30:00Z',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    codigoParticularCliente: 'C2000',
    nombreCliente: 'KIOSCO SUR',
    codigoAutor: '9001',
    nombreAutor: 'GOMEZ LUCIA',
    motivos: ['Saqué pedido'],
    resultado: 'ganado',
}

const pagina = (contactos: IContactosPage['contactos']): IContactosPage => ({
    total: contactos.length,
    pagina: 1,
    cant: contactos.length,
    contactos,
})

function conQuery(ui: ReactNode, ruta: string, path: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <Routes>
                    <Route path={path} element={ui} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

const ultimaLlamada = () => {
    const llamadas = (api.getContactos as any).mock.calls
    return llamadas[llamadas.length - 1][0]
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getVendedores as any).mockResolvedValue(MOCK_VENDEDORES)
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    ;(api.getContactos as any).mockResolvedValue(pagina([LLAMADO, VISITA]))
    ;(api.getLlamadoDetalle as any).mockResolvedValue({
        ...LLAMADO,
        motivos: [],
        ofrecimientos: [],
        observaciones: null,
        proximoContacto: null,
    })
})

describe('/analitica/actividad', () => {
    const montar = (q = '') =>
        conQuery(<AnaliticaActividadPage />, `/analitica/actividad?desde=2026-07-20&hasta=2026-07-24${q}`, '/analitica/actividad')

    it('pide visitas y llamados mezclados, del equipo y sin filtro de canal', async () => {
        montar()
        await waitFor(() => expect(api.getContactos).toHaveBeenCalled())
        expect(ultimaLlamada()).toMatchObject({ desde: '2026-07-20', hasta: '2026-07-24' })
        expect(ultimaLlamada().vendedor).toBeUndefined()
        expect(ultimaLlamada().canal).toBeUndefined()
        expect(api.getVisitas).not.toHaveBeenCalled()
    })

    it('muestra el llamado en la tabla y lo cuenta aparte de las visitas', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        const kpiLlamados = screen.getByText('Llamados', { selector: 'p' }).parentElement!
        expect(within(kpiLlamados).getByText('1')).toBeInTheDocument()
        const kpiCerradas = screen.getByText('Visitas cerradas').parentElement!
        expect(within(kpiCerradas).getByText('1')).toBeInTheDocument()
    })

    it('pide una página grande: los llamados no le sacan lugar a las visitas', async () => {
        montar()
        await waitFor(() => expect(api.getContactos).toHaveBeenCalled())
        expect(ultimaLlamada().cant).toBe(200)
    })

    it('el filtro "Llamados" deja solo los llamados en la tabla, sin mover los KPI', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        await userEvent.click(screen.getByRole('button', { name: 'Llamados' }))
        await waitFor(() => expect(screen.queryByText('CALDERON ALEJANDRO PABLO')).not.toBeInTheDocument())
        expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument()
        const kpiCerradas = screen.getByText('Visitas cerradas').parentElement!
        expect(within(kpiCerradas).getByText('1')).toBeInTheDocument()
        // No vuelve a pedir con canal: el filtro es de la tabla.
        expect(ultimaLlamada().canal).toBeUndefined()
    })

    it('el canal se lee de la URL', async () => {
        montar('&canal=visita')
        await waitFor(() => expect(screen.getByText('CALDERON ALEJANDRO PABLO')).toBeInTheDocument())
        expect(screen.queryByText('KIOSCO SUR')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Visitas' })).toHaveAttribute('aria-pressed', 'true')
        const kpiLlamados = screen.getByText('Llamados', { selector: 'p' }).parentElement!
        expect(within(kpiLlamados).getByText('1')).toBeInTheDocument()
    })

    it('tocar un llamado abre su detalle, no el de una visita', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        await userEvent.click(screen.getByText('KIOSCO SUR'))
        await waitFor(() => expect(api.getLlamadoDetalle).toHaveBeenCalledWith(9))
        expect(api.getVisitaDetalle).not.toHaveBeenCalled()
    })
})

describe('/analitica/vendedor/:codigo', () => {
    const montar = (q = '') =>
        conQuery(<AnaliticaVendedorPage />, `/analitica/vendedor/V1?desde=2026-07-20&hasta=2026-07-24${q}`, '/analitica/vendedor/:codigo')

    it('pide los contactos del vendedor y lista el llamado junto a las visitas', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        expect(ultimaLlamada()).toMatchObject({ vendedor: 'V1', desde: '2026-07-20', hasta: '2026-07-24' })
        expect(screen.getByText('CALDERON ALEJANDRO PABLO')).toBeInTheDocument()
    })

    it('la tarjeta Llamados muestra el total, atendidos y con venta, con el promedio del equipo', async () => {
        const v1 = MOCK_RESUMEN.vendedores.find(v => v.codigoParticularVendedor === 'V1')!
        ;(api.getResumen as any).mockResolvedValue({
            ...MOCK_RESUMEN,
            vendedores: [{ ...v1, llamados: 23, llamadosAtendidos: 15, llamadosConVenta: 6 }],
            promedios: { ...MOCK_RESUMEN.promedios, llamados: 20 },
        })
        montar()
        const tarjeta = await screen.findByTestId('tarjeta-Llamados')
        expect(within(tarjeta).getByText('23')).toBeInTheDocument()
        expect(within(tarjeta).getByText('15')).toBeInTheDocument()
        expect(within(tarjeta).getByText('6')).toBeInTheDocument()
        expect(within(tarjeta).getByText('equipo: 20')).toBeInTheDocument()
    })

    it('sin llamados en el resumen (backend anterior) no inventa la tarjeta', async () => {
        const { llamados: _l, llamadosAtendidos: _a, llamadosConVenta: _c, ...v1 } = MOCK_RESUMEN.vendedores.find(
            v => v.codigoParticularVendedor === 'V1',
        )!
        ;(api.getResumen as any).mockResolvedValue({ ...MOCK_RESUMEN, vendedores: [v1] })
        montar()
        await screen.findByTestId('tarjeta-Visitas')
        expect(screen.queryByTestId('tarjeta-Llamados')).not.toBeInTheDocument()
    })

    it('elegir "Llamados" pide ese canal y apaga el filtro de validez', async () => {
        montar('&validez=valida')
        await waitFor(() => expect(api.getContactos).toHaveBeenCalled())
        expect(ultimaLlamada()).toMatchObject({ validez: 'valida' })
        await userEvent.click(screen.getByRole('button', { name: 'Llamados' }))
        await waitFor(() => expect(ultimaLlamada().canal).toEqual(['llamado']))
        expect(ultimaLlamada().validez).toBeUndefined()
    })

    it('filtrar por validez pasa el canal a "Visitas": un llamado no se valida', async () => {
        montar('&canal=llamado')
        await waitFor(() => expect(api.getContactos).toHaveBeenCalled())
        await userEvent.click(await screen.findByRole('button', { name: /^Válidas/ }))
        await waitFor(() => expect(ultimaLlamada().validez).toBe('valida'))
        expect(ultimaLlamada().canal).toEqual(['visita'])
        expect(screen.getByRole('button', { name: 'Visitas' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('una URL con "Llamados" y validez manda el canal y descarta la validez', async () => {
        montar('&canal=llamado&validez=valida')
        await waitFor(() => expect(api.getContactos).toHaveBeenCalled())
        expect(ultimaLlamada().canal).toEqual(['llamado'])
        expect(ultimaLlamada().validez).toBeUndefined()
    })
})
