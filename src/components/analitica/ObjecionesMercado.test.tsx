import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ObjecionesMercado from './ObjecionesMercado'
import { MOCK_OBJECIONES } from '@/mocks/analiticaMock'
import * as api from '@/api/analitica'

vi.mock('@/api/analitica')

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <ObjecionesMercado desde="2026-07-20" hasta="2026-07-24" />
        </QueryClientProvider>,
    )
}

beforeEach(() => vi.clearAllMocks())

it('lista los motivos con su cantidad y porcentaje', async () => {
    ;(api.getObjeciones as any).mockResolvedValue(MOCK_OBJECIONES)
    montar()
    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument())
    expect(screen.getByText('98')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
})

it('sin objeciones en el rango muestra un vacío explícito', async () => {
    ;(api.getObjeciones as any).mockResolvedValue({ total: 0, motivos: [] })
    montar()
    await waitFor(() =>
        expect(screen.getByText(/sin motivos cargados/i)).toBeInTheDocument(),
    )
})

it('distingue visualmente los motivos que son pérdida', async () => {
    ;(api.getObjeciones as any).mockResolvedValue(MOCK_OBJECIONES)
    montar()
    await waitFor(() => expect(screen.getByText('Precio')).toBeInTheDocument())
    expect(screen.getByTestId('objecion-2')).toHaveClass('border-l-red-400')
})
