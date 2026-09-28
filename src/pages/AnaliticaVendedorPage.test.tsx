import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import AnaliticaVendedorPage from './AnaliticaVendedorPage'
import { MOCK_RESUMEN, MOCK_VISITAS } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'
import { formatHoras } from '@/lib/analiticaFormat'

vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Martín Rossi' }, logout: vi.fn() }),
}))

function montar(codigo = 'V1') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter
                initialEntries={[`/analitica/vendedor/${codigo}?desde=2026-07-20&hasta=2026-07-24`]}
            >
                <Routes>
                    <Route
                        path="/analitica/vendedor/:codigo"
                        element={<AnaliticaVendedorPage />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
})

it('muestra el nombre del vendedor y sus visitas', async () => {
    ;(api.getVisitas as any).mockResolvedValue({
        total: MOCK_VISITAS['V1'].length,
        pagina: 1,
        cant: MOCK_VISITAS['V1'].length,
        visitas: MOCK_VISITAS['V1'],
    })
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
})

it('pide las visitas del vendedor de la URL con el rango de la query', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar('V4')
    await waitFor(() => expect(api.getVisitas).toHaveBeenCalled())
    expect(api.getVisitas).toHaveBeenCalledWith(
        expect.objectContaining({ vendedor: 'V4', desde: '2026-07-20', hasta: '2026-07-24' }),
    )
})

it('sin visitas en el rango muestra un vacío explícito', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByText(/sin visitas en este rango/i)).toBeInTheDocument())
})

it('ofrece volver al nivel 1 conservando el rango', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    await waitFor(() => expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute(
        'href',
        '/analitica?desde=2026-07-20&hasta=2026-07-24',
    )
})

it('no corta el rango en la primera página: "Mostrar más" trae la siguiente', async () => {
    const [a, b] = MOCK_VISITAS['V1']
    ;(api.getVisitas as any).mockImplementation(async (args: api.IVisitasArgs) =>
        args.pagina === 2
            ? { total: 2, pagina: 2, cant: 1, visitas: [b] }
            : { total: 2, pagina: 1, cant: 1, visitas: [a] },
    )
    montar()
    await waitFor(() => expect(screen.getByText('Mostrando 1 de 2')).toBeInTheDocument())
    screen.getByRole('button', { name: 'Mostrar más' }).click()
    await waitFor(() => expect(screen.getByText('Mostrando 2 de 2')).toBeInTheDocument())
    expect(screen.getByText(b.nombreCliente)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostrar más' })).not.toBeInTheDocument()
    expect(api.getVisitas).toHaveBeenCalledWith(expect.objectContaining({ pagina: 2 }))
})

it('cambiar la fecha "Desde" vuelve a pedir las visitas con el rango nuevo', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    const desde = await screen.findByLabelText('Desde')
    expect(desde).toHaveValue('2026-07-20')
    fireEvent.change(desde, { target: { value: '2026-07-01' } })
    await waitFor(() =>
        expect(api.getVisitas).toHaveBeenCalledWith(
            expect.objectContaining({ desde: '2026-07-01', hasta: '2026-07-24' }),
        ),
    )
    expect(screen.getByText('2026-07-01 a 2026-07-24')).toBeInTheDocument()
})

it('muestra las visitas del rango con su desglose válidas / no validadas, y las horas', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    const v1 = MOCK_RESUMEN.vendedores.find(v => v.codigoParticularVendedor === 'V1')!
    montar()
    const tile = async (titulo: string) =>
        (await screen.findByText(titulo, { selector: 'p' })).parentElement!
    const visitas = await tile('Visitas')
    expect(visitas).toHaveTextContent(String(v1.visitasTotales))
    expect(visitas).toHaveTextContent(
        `${v1.visitasValidas} válidas · ${v1.visitasNoValidadas} no validadas`,
    )
    expect(screen.queryByText('No validadas', { selector: 'p' })).not.toBeInTheDocument()
    expect(await tile('Horas')).toHaveTextContent(formatHoras(v1.minutosTotales))
})

it('tocar "válidas" filtra la tabla por validez, y tocarlo de nuevo lo quita', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    const validas = await screen.findByRole('button', { name: /válidas$/ })
    fireEvent.click(validas)
    await waitFor(() =>
        expect(api.getVisitas).toHaveBeenLastCalledWith(expect.objectContaining({ validez: 'valida' })),
    )
    expect(validas).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Sin visitas válidas en este rango.')).toBeInTheDocument()

    fireEvent.click(validas)
    await waitFor(() =>
        expect(api.getVisitas).toHaveBeenLastCalledWith(expect.objectContaining({ validez: undefined })),
    )
    expect(validas).toHaveAttribute('aria-pressed', 'false')
})

it('cambiar el rango conserva el filtro de validez', async () => {
    ;(api.getVisitas as any).mockResolvedValue({ total: 0, pagina: 1, cant: 0, visitas: [] })
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /no validadas$/ }))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-07-01' } })
    await waitFor(() =>
        expect(api.getVisitas).toHaveBeenLastCalledWith(
            expect.objectContaining({ desde: '2026-07-01', validez: 'no_validada' }),
        ),
    )
})
