import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'no_visita', fechaVisita: '2026-09-21',
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

it('sin altas en el rango lo dice', async () => {
    vi.mocked(apiAnalitica.getAltas).mockResolvedValue([])
    montar('/analitica/altas?desde=2026-09-21&hasta=2026-09-25')
    expect(await screen.findByText(/sin clientes nuevos entre/i)).toBeInTheDocument()
})
