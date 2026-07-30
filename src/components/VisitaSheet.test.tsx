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
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600, mesAnterior: 800, promedio6m: 1000 },
    ])
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

it('entrar a un rubro abre el wizard de resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})

it('finalizar guarda solo los rubros con cambios y cierra el wizard', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))
    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    // Filtros no cambió: no se manda su PUT.
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
    // Sin fallidos, Finalizar cierra el wizard y vuelve a la lista.
    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
})

it('si finalizar falla, no se pierde lo tildado y ofrece reintentar', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))
    expect(await screen.findByRole('button', { name: /reintentar \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/no se pudo guardar.*amortiguadores/i)).toBeInTheDocument()
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

it('con la visita cerrada, un rubro YA resuelto no se puede reabrir (es solo resumen)', async () => {
    // No se editan visitas ya cerradas — Filtros ya tiene un motivo cargado.
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /motivo cargado/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Filtros'))
    // Sigue en la lista (no pasó a la vista de edición de Filtros).
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('con la visita cerrada, un rubro TODAVÍA sin resolver se puede completar', async () => {
    // Amortiguadores no tiene motivos: es justo lo que el aviso de "rubros sin cargar"
    // invita a venir a completar, aunque la visita ya haya cerrado. Filtros ya está
    // resuelto y queda fuera del recorrido (subset de 1).
    renderSheet({ visitaCerrada: true })
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('1 de 1')).toBeInTheDocument()
})

it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    // Sigue tildado: avanzar y finalizar todavía manda el cambio de Amortiguadores.
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))
    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
})

it('con la visita cerrada, un rubro ya resuelto no ofrece borrarlo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
})

it('con la visita abierta ofrece cerrarla', async () => {
    const { onCerrarVisita } = renderSheet()
    await screen.findByText('Amortiguadores')
    fireEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))
    expect(onCerrarVisita).toHaveBeenCalled()
})

it('en curso muestra el eyebrow naranja con cronómetro y el botón de minimizar', async () => {
    const onMinimize = vi.fn()
    renderSheet({ enCurso: true, onMinimize })
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Minimizar'))
    expect(onMinimize).toHaveBeenCalled()
})

it('sin enCurso no ofrece minimizar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByLabelText('Minimizar')).not.toBeInTheDocument()
})

it('sin codigoParticularCliente no ofrece ver versus', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /ver versus/i })).not.toBeInTheDocument()
})

it('con codigoParticularCliente, ver versus pide el estado de rubros y muestra la tabla', async () => {
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    expect(api.getRubroStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /ver versus/i }))
    expect(await screen.findByText('Cómo viene comprando')).toBeInTheDocument()
    await waitFor(() => expect(api.getRubroStatus).toHaveBeenCalledWith('10034'))
    expect(await screen.findByText('1.000')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Volver'))
    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
})
