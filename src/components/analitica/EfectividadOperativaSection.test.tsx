import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import EfectividadOperativaSection from './EfectividadOperativaSection'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <EfectividadOperativaSection />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
})

it('pide el resumen del mes en curso y muestra la tabla', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    const hoy = new Date()
    const filtroEsperado = expect.objectContaining({
        desde: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    })
    expect(api.getResumen).toHaveBeenCalledWith(filtroEsperado)
    // el filtro pedido tiene que ser del mes en curso, no del mes calendario anterior o siguiente.
    const filtroReal = (api.getResumen as any).mock.calls[0][0]
    expect(filtroReal.desde.slice(0, 7)).toBe(
        `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`,
    )
})

it('sin datos en el mes muestra un vacío explícito', async () => {
    ;(api.getResumen as any).mockResolvedValue({
        desde: '2020-01-01',
        hasta: '2020-01-31',
        diasHabiles: 0,
        promedios: { ...MOCK_RESUMEN.promedios, efectividadOperativa: null },
        vendedores: [],
    })
    montar()
    await waitFor(() => expect(screen.getByText(/sin datos para este mes/i)).toBeInTheDocument())
})

it('cambiar de mes pide un nuevo resumen con el rango del mes elegido', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    const llamadasAntes = (api.getResumen as any).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() =>
        expect((api.getResumen as any).mock.calls.length).toBeGreaterThan(llamadasAntes),
    )
})

it('cambiar a modo semana pide el resumen de la semana en curso', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument())
    const filtroReal = (api.getResumen as any).mock.calls.at(-1)[0]
    // lunes a viernes: el rango dura como máximo 4 días.
    const dias = (new Date(filtroReal.hasta).getTime() - new Date(filtroReal.desde).getTime()) / 86_400_000
    expect(dias).toBeLessThanOrEqual(4)
})

it('muestra Objeciones del mercado con el mismo rango que la tabla', async () => {
    ;(api.getResumen as any).mockResolvedValue(MOCK_RESUMEN)
    montar()
    await waitFor(() => expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Objeciones del mercado' })).toBeInTheDocument()
    const filtroReal = (api.getResumen as any).mock.calls[0][0]
    expect(api.getObjeciones).toHaveBeenCalledWith(
        expect.objectContaining({ desde: filtroReal.desde, hasta: filtroReal.hasta }),
    )
})
