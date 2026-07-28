import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubros = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: true,
        motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
    },
]

function renderSheet(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCerrarVisita = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaSheet
                open
                visitaId={42}
                nombreCliente="Almacén Don José"
                visitaCerrada={false}
                onCerrarVisita={onCerrarVisita}
                onClose={() => {}}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCerrarVisita }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getRubros as any).mockResolvedValue(rubros)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
})

it('lista los rubros de la propuesta congelada', async () => {
    renderSheet()
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('pide el catálogo de nivel rubro, no el completo', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(api.getMotivos).toHaveBeenCalledWith('rubro')
})

it('entrar a un rubro abre su resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('Resolución')).toBeInTheDocument()
})

it('guardar persiste los motivos del rubro', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
})

it('si el guardado falla, NO vuelve a la lista y conserva lo tildado', async () => {
    // El vendedor tipeó marca/competidor: perder eso por un bache de señal lo entrena
    // a no cargarlo más.
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(screen.getByText('Resolución')).toBeInTheDocument()
})

it('un rubro de la propuesta no se puede borrar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    // Solo el agregado a mano (esPropuesto: false) ofrece borrar.
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita abierta ofrece cerrarla', async () => {
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')
    fireEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))
    expect(onCerrarVisita).toHaveBeenCalled()
})
