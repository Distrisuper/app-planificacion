import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import MetricasPage from './MetricasPage'
import type { IMisMetricas } from '@/types/misMetricas'

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Marcelo Fernandez' }, logout: vi.fn(), capacidades: null }),
}))

const getMisMetricas = vi.hoisted(() => vi.fn())
vi.mock('@/api/misMetricas', () => ({ getMisMetricas }))

const base = (over: Partial<IMisMetricas> = {}): IMisMetricas => ({
    desde: '2026-08-01',
    hasta: '2026-08-31',
    diasHabiles: 21,
    diasHabilesTranscurridos: 21,
    mesCompleto: false,
    unidades: 410,
    unidadesMmaa: 407,
    superRubro: 10,
    superRubroMmaa: 9,
    objetivoClientes: 134,
    cartera: 145,
    clientesVisitados: 119,
    clientesDistintos: 124,
    clientesConCompra: 72,
    visitadosConCompra: 61,
    planificados: 92,
    planificadosConCompra: 72,
    visitasValidas: 142,
    objetivoVisitas: 160,
    minutosTotales: 4932,
    objetivoMinutos: 6000,
    facturacion: 132_000_000,
    facturacionMmaa: 146_700_000,
    sinVentas: false,
    ...over,
})

function renderPage() {
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
                <MetricasPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

beforeEach(() => getMisMetricas.mockReset())

it('muestra productividad sobre la cartera y ventas contra el MMAA', async () => {
    getMisMetricas.mockResolvedValue(base())
    renderPage()
    const visitados = await screen.findByTestId('tile-visitados')
    expect(visitados).toHaveTextContent('119 / 145')
    expect(visitados).toHaveTextContent('82%')
    expect(screen.getByTestId('tile-tasa-cierre')).toHaveTextContent('51%')
    const horas = screen.getByTestId('objetivo-horas')
    expect(horas).toHaveTextContent('82,2 / 100 h')
    expect(horas).toHaveTextContent('faltan 17,8 h')
    expect(screen.getByTestId('objetivo-visitas')).toHaveTextContent('142 / 160')
    expect(screen.getByTestId('objetivo-visitas')).toHaveTextContent('faltan 18')
    const fact = screen.getByTestId('anillo-facturacion')
    expect(fact).toHaveTextContent('90%')
    expect(fact).toHaveTextContent('-10% vs MMAA')
})

// Contra el objetivo van los clientes con visita válida (el número de gerencia), no los de la
// cartera: una visita a un alta o a un cliente de otro vendedor también es un cliente visitado.
it('el objetivo de clientes compara clientesDistintos, no los visitados de la cartera', async () => {
    getMisMetricas.mockResolvedValue(base())
    renderPage()
    const clientes = await screen.findByTestId('objetivo-clientes')
    expect(clientes).toHaveTextContent('124 / 134')
    expect(clientes).toHaveTextContent('faltan 10')
    expect(screen.getByTestId('tile-visitados')).toHaveTextContent('119 / 145')
})

it('superado el objetivo dice cumplido, no "faltan -2"', async () => {
    getMisMetricas.mockResolvedValue(base({ visitasValidas: 162 }))
    renderPage()
    expect(await screen.findByTestId('objetivo-visitas')).toHaveTextContent('cumplido')
})

it('sin objetivo vigente no inventa un denominador', async () => {
    getMisMetricas.mockResolvedValue(base({ objetivoVisitas: null }))
    renderPage()
    const visitas = await screen.findByTestId('objetivo-visitas')
    expect(visitas).toHaveTextContent('sin objetivo')
    expect(visitas).not.toHaveTextContent('%')
})

it('el vendedor de prueba no ve anillos de ventas en 0%', async () => {
    getMisMetricas.mockResolvedValue(base({ sinVentas: true }))
    renderPage()
    expect(await screen.findByText('Sin datos de ventas para este vendedor.')).toBeInTheDocument()
    expect(screen.queryByTestId('anillo-facturacion')).not.toBeInTheDocument()
})

it('el vendedor de prueba sin cartera ve por qué no hay métricas, no "no tenés clientes"', async () => {
    getMisMetricas.mockResolvedValue(base({ sinVentas: true, cartera: 0 }))
    renderPage()
    expect(await screen.findByText(/Tu vendedor de prueba no tiene métricas/)).toBeInTheDocument()
    expect(screen.queryByText(/no tenés clientes/)).not.toBeInTheDocument()
})

it('el mes en curso no deja avanzar; retroceder pide el mes anterior completo', async () => {
    getMisMetricas.mockResolvedValue(base())
    renderPage()
    await screen.findByTestId('tile-visitados')
    const hoy = new Date()
    expect(getMisMetricas).toHaveBeenCalledWith(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), iso(hoy))
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(getMisMetricas).toHaveBeenLastCalledWith(
        iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    )
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()
})

it('si falla, ofrece reintentar', async () => {
    getMisMetricas.mockRejectedValueOnce(new Error('x')).mockResolvedValue(base())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Volver a intentar' }))
    expect(await screen.findByTestId('tile-visitados')).toHaveTextContent('119 / 145')
})
