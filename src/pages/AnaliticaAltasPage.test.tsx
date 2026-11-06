import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { rangoMes } from '@/lib/fechas'
import { titleCaseNombre } from '@/lib/textFormat'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaAltasPage from './AnaliticaAltasPage'
import { MOCK_VENDEDORES } from '@/mocks/analiticaMock'
import * as apiAnalitica from '@/api/analitica'
import * as apiPlanificacion from '@/api/planificacion'
import * as csv from '@/lib/csv'
import type { IAltaRelevada } from '@/types/analitica'
import type { IEsquemaAlta } from '@/types/planificacion'

vi.mock('@/api/analitica')
vi.mock('@/api/planificacion')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

const ESQUEMA: IEsquemaAlta = {
    secciones: [{ clave: 'identidad', titulo: 'Identidad' }, { clave: 'ubicacion', titulo: 'Ubicación' }],
    campos: [
        { clave: 'nombre', etiqueta: 'Nombre del comercio', seccion: 'identidad', tipo: 'texto', max: 120, requerido: true },
        { clave: 'localidad', etiqueta: 'Localidad', seccion: 'ubicacion', tipo: 'texto', max: 120 },
    ],
    catalogos: null,
}
const alta: IAltaRelevada = {
    origen: 'planificacion', rotacionClienteId: 9, prospectoId: null, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'no_visita', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche', localidad: 'Zárate' }, contacto: null, camposCargados: 2, camposTotal: 15,
}

function montar(ruta: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[ruta]}>
                <AnaliticaAltasPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiAnalitica.getVendedores).mockResolvedValue(MOCK_VENDEDORES)
    vi.mocked(apiPlanificacion.getEsquemaAlta).mockResolvedValue(ESQUEMA)
})

it('lista las altas del rango y abre el detalle al tocar una fila', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    fireEvent.click(await screen.findByText('Piche'))
    expect(await screen.findByText('Identidad')).toBeInTheDocument()
})

it('Exportar CSV arma el archivo con las filas filtradas', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    const descargar = vi.spyOn(csv, 'descargarCsv').mockImplementation(() => {})
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    await screen.findByText('Piche')
    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }))
    expect(descargar).toHaveBeenCalledWith(expect.stringMatching(/^altas-\d{4}-\d{2}-\d{2}\.csv$/), expect.stringContaining('Piche'))
})

it('el período es Día/Semana/Mes: arranca en la semana de la URL y Mes pide el mes entero', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    await screen.findByText('Piche')
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('21/09 al 25/09')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }))
    await waitFor(() =>
        expect(apiAnalitica.getAltas).toHaveBeenLastCalledWith(expect.objectContaining({ desde: expect.stringMatching(/-01$/) })),
    )
    const { desde, hasta } = vi.mocked(apiAnalitica.getAltas).mock.lastCall![0]
    expect(rangoMes(new Date())).toEqual({ desde, hasta })
})

it('un link viejo con un rango libre muestra y pide el mes entero, no el rango a medias', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar('/analitica/altas?desde=2026-10-05&hasta=2026-10-20')
    await screen.findByText('Piche')
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument()
    expect(apiAnalitica.getAltas).toHaveBeenLastCalledWith(
        expect.objectContaining({ desde: '2026-10-01', hasta: '2026-10-31' }),
    )
})

it('los vendedores se eligen con el selector del estándar y viajan al backend', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    await screen.findByText('Piche')
    fireEvent.click(screen.getByRole('button', { name: 'Vendedores' }))
    fireEvent.click(await screen.findByRole('option', { name: titleCaseNombre(MOCK_VENDEDORES[0].nombreVendedor) }))
    await waitFor(() =>
        expect(apiAnalitica.getAltas).toHaveBeenLastCalledWith(
            expect.objectContaining({ vendedores: [MOCK_VENDEDORES[0].codigoParticularVendedor] }),
        ),
    )
})

const deTv: IAltaRelevada = {
    origen: 'televentas', rotacionClienteId: null, prospectoId: 9, vendedor: { codigo: 'TV1', nombre: 'Lucía' }, estado: 'visitada',
    fechaVisita: null, detalle: { nombre: 'Kiosco Sol', localidad: 'Campana' }, contacto: null, camposCargados: 2, camposTotal: 15, vinculo: null,
}

it('vincular un alta de televentas va por su prospecto, nunca por /altas/null', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta, deTv])
    vi.mocked(apiAnalitica.vincularProspecto).mockResolvedValue({
        codigoParticularCliente: '10034', vinculadoPor: 'admin@x.com', vinculadoEn: '2026-09-23T14:00:00.000Z', fichaMovida: 0,
    })
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    fireEvent.click(await screen.findByText('Kiosco Sol'))
    fireEvent.change(await screen.findByLabelText(/código de cliente en flexxus/i), { target: { value: '10034' } })
    fireEvent.click(screen.getByRole('button', { name: /^vincular$/i }))
    await waitFor(() => expect(apiAnalitica.vincularProspecto).toHaveBeenCalledWith(9, '10034'))
    expect(apiAnalitica.vincularAlta).not.toHaveBeenCalled()
})

it('con dos altas de televentas, tocar la segunda abre y vincula la segunda', async () => {
    const otraTv: IAltaRelevada = { ...deTv, prospectoId: 12, detalle: { nombre: 'Almacén Luna' } }
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([deTv, otraTv])
    vi.mocked(apiAnalitica.vincularProspecto).mockResolvedValue({
        codigoParticularCliente: '10036', vinculadoPor: 'admin@x.com', vinculadoEn: '2026-09-23T14:00:00.000Z', fichaMovida: 0,
    })
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    fireEvent.click(await screen.findByText('Almacén Luna'))
    expect(await screen.findByRole('heading', { name: 'Almacén Luna' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/código de cliente en flexxus/i), { target: { value: '10036' } })
    fireEvent.click(screen.getByRole('button', { name: /^vincular$/i }))
    await waitFor(() => expect(apiAnalitica.vincularProspecto).toHaveBeenCalledWith(12, '10036'))
})

it('vincular un alta de planificación sigue yendo por su fila del plan', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([{ ...alta, estado: 'visitada' }, deTv])
    vi.mocked(apiAnalitica.vincularAlta).mockResolvedValue({
        codigoParticularCliente: '10035', vinculadoPor: 'admin@x.com', vinculadoEn: '2026-09-23T14:00:00.000Z', fichaMovida: 1,
    })
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    fireEvent.click(await screen.findByText('Piche'))
    fireEvent.change(await screen.findByLabelText(/código de cliente en flexxus/i), { target: { value: '10035' } })
    fireEvent.click(screen.getByRole('button', { name: /^vincular$/i }))
    await waitFor(() => expect(apiAnalitica.vincularAlta).toHaveBeenCalledWith(9, '10035'))
    expect(apiAnalitica.vincularProspecto).not.toHaveBeenCalled()
})

it('el filtro por origen deja solo las de Televentas y vuelve a Todas', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta, deTv])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    await screen.findByText('Piche')
    const origen = screen.getByRole('group', { name: 'Origen' })
    fireEvent.click(within(origen).getByRole('button', { name: 'Televentas' }))
    expect(screen.queryByText('Piche')).not.toBeInTheDocument()
    expect(screen.getByText('Kiosco Sol')).toBeInTheDocument()
    fireEvent.click(within(origen).getByRole('button', { name: 'Todas' }))
    expect(screen.getByText('Piche')).toBeInTheDocument()
})

it('Exportar CSV con el filtro de origen exporta solo ese origen, con la columna Origen', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta, deTv])
    const descargar = vi.spyOn(csv, 'descargarCsv').mockImplementation(() => {})
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25&origen=televentas')
    await screen.findByText('Kiosco Sol')
    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }))
    const contenido = descargar.mock.lastCall![1]
    expect(contenido).toContain('Origen')
    expect(contenido).toContain('Kiosco Sol')
    expect(contenido).not.toContain('Piche')
})

it('sin altas de Televentas con vendedores elegidos explica por qué', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([alta])
    montar(`/analitica/altas?desde=2026-09-21&hasta=2026-09-25&origen=televentas&vendedores=${MOCK_VENDEDORES[0].codigoParticularVendedor}`)
    expect(await screen.findByText(/no se filtran por vendedor/i)).toBeInTheDocument()
})

it('sin altas en el rango lo dice', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    expect(await screen.findByText(/sin clientes nuevos entre/i)).toBeInTheDocument()
})
