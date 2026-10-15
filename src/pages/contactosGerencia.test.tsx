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
import type { IContactoLlamado, IContactoVisita, IContactosConteos, IContactosPage } from '@/types/analitica'

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

/** Los conteos que mandaría el back para estas filas (todo el filtro, sin canal). */
const conteosDe = (contactos: IContactosPage['contactos']): IContactosConteos => {
    const visitas = contactos.flatMap(f => (f.canal === 'visita' ? [f] : []))
    const llamados = contactos.flatMap(f => (f.canal === 'llamado' ? [f] : []))
    return {
        visitasCerradas: visitas.filter(v => v.tipo === 'visita' && v.fechaFin !== null).length,
        visitasEnCurso: visitas.filter(v => v.tipo === 'visita' && v.fechaFin === null).length,
        noVisita: visitas.filter(v => v.tipo === 'no_visita').length,
        llamados: llamados.length,
        llamadosAtendidos: llamados.filter(l => l.tipo === 'atendido').length,
        llamadosConVenta: llamados.filter(l => l.estado === 'venta').length,
    }
}

const pagina = (
    contactos: IContactosPage['contactos'],
    conteos: IContactosConteos = conteosDe(contactos),
): IContactosPage => ({
    total: contactos.length,
    pagina: 1,
    cant: contactos.length,
    contactos,
    conteos,
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
    // Como el back: el canal filtra las filas, los conteos son de todo el filtro.
    ;(api.getContactos as any).mockImplementation(async (a: api.IContactosArgs) =>
        pagina(
            [LLAMADO, VISITA].filter(f => !a.canal || a.canal.includes(f.canal)),
            conteosDe([LLAMADO, VISITA]),
        ),
    )
    ;(api.getTelevendedores as any).mockResolvedValue([
        { codigoParticularTv: '9001', nombreTv: 'GOMEZ LUCIA', activo: true },
        { codigoParticularTv: '9002', nombreTv: 'ROMERO JULIAN', activo: false },
    ])
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

    it('los KPI salen de los conteos del back, no de las filas de la página', async () => {
        ;(api.getContactos as any).mockResolvedValue({
            ...pagina([LLAMADO, VISITA]),
            total: 330,
            conteos: {
                visitasCerradas: 250,
                visitasEnCurso: 5,
                noVisita: 3,
                llamados: 72,
                llamadosAtendidos: 41,
                llamadosConVenta: 12,
            },
        })
        montar()
        const kpiCerradas = (await screen.findByText('Visitas cerradas')).parentElement!
        await waitFor(() => expect(within(kpiCerradas).getByText('250')).toBeInTheDocument())
        const kpiLlamados = screen.getByText('Llamados', { selector: 'p' }).parentElement!
        expect(within(kpiLlamados).getByText('72')).toBeInTheDocument()
        expect(within(kpiLlamados).getByText('41 atendidos · 12 con venta')).toBeInTheDocument()
    })

    it('pagina de a 100 y "Mostrar más" pide la página siguiente', async () => {
        ;(api.getContactos as any).mockImplementation(async (a: api.IContactosArgs) => ({
            ...pagina(a.pagina === 2 ? [VISITA] : [LLAMADO]),
            pagina: a.pagina ?? 1,
            total: 2,
        }))
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        expect(ultimaLlamada()).toMatchObject({ cant: 100, pagina: 1 })
        expect(screen.getByText('Mostrando 1 de 2')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Mostrar más' }))
        await waitFor(() => expect(screen.getByText('CALDERON ALEJANDRO PABLO')).toBeInTheDocument())
        expect(ultimaLlamada()).toMatchObject({ pagina: 2 })
        expect(screen.queryByRole('button', { name: 'Mostrar más' })).not.toBeInTheDocument()
    })

    it('el filtro "Llamados" pide ese canal y los KPI no se mueven', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        await userEvent.click(screen.getByRole('button', { name: 'Llamados' }))
        await waitFor(() => expect(screen.queryByText('CALDERON ALEJANDRO PABLO')).not.toBeInTheDocument())
        expect(ultimaLlamada().canal).toEqual(['llamado'])
        expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument()
        const kpiCerradas = screen.getByText('Visitas cerradas').parentElement!
        expect(within(kpiCerradas).getByText('1')).toBeInTheDocument()
    })

    it('elegir un TV filtra por quién llamó y deja el canal en "Llamados"', async () => {
        montar()
        await userEvent.click(await screen.findByRole('button', { name: /Televentas: Todos/ }))
        await userEvent.click(await screen.findByRole('checkbox', { name: 'GOMEZ LUCIA' }))
        await waitFor(() => expect(ultimaLlamada().autores).toEqual(['9001']))
        expect(ultimaLlamada().canal).toEqual(['llamado'])
        expect(screen.getByRole('button', { name: 'Llamados' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: /Televentas: GOMEZ LUCIA/ })).toBeInTheDocument()
    })

    it('los TV se leen de la URL, y pasar a "Visitas" los suelta', async () => {
        montar('&tvs=9001,9002')
        await waitFor(() => expect(ultimaLlamada().autores).toEqual(['9001', '9002']))
        await userEvent.click(screen.getByRole('button', { name: 'Visitas' }))
        await waitFor(() => expect(ultimaLlamada().canal).toEqual(['visita']))
        expect(ultimaLlamada().autores).toBeUndefined()
    })

    it('en el llamado se ve quién llamó y de qué vendedor es el cliente', async () => {
        montar()
        await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
        const fila = screen.getByText('KIOSCO SUR').closest('tr')!
        expect(within(fila).getByText('GOMEZ LUCIA')).toBeInTheDocument()
        expect(within(fila).getByText('cliente de ACOSTA MARIANO')).toBeInTheDocument()
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
