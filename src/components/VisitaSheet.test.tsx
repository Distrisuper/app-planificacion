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
    localStorage.clear()
    ;(api.getRubros as any).mockResolvedValue(rubros)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600, mesAnterior: 800, promedio6m: 1000 },
    ])
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'BAT', description: 'Baterías' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
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

it('finalizar cierra el wizard sin llamar al backend: el cambio queda en el borrador', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))

    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
    expect(api.resolverRubro).not.toHaveBeenCalled()
    expect(screen.getByText('1 motivo cargado')).toBeInTheDocument()
})

it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Saqué pedido').closest('button')).toHaveClass('border-[#B9CCEC]')
})

it('el cambio tildado en el wizard se persiste en localStorage al instante', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))

    await waitFor(() => {
        const borrador = JSON.parse(localStorage.getItem('visita-borrador-42') ?? '{}')
        expect(borrador[7]).toEqual([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    })
})

it('un rubro de la propuesta no se puede borrar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, ningún rubro se puede reabrir (es solo resumen, aunque haya quedado sin resolver)', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /motivo cargado/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^resolución$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Amortiguadores'))
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('con la visita cerrada, un rubro ya resuelto no ofrece borrarlo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
})

it('con rubros sin completar, Cerrar visita está deshabilitado y avisa cuántos faltan', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/faltan completar 1 rubro para poder cerrar la visita/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})

it('con todos los rubros completos, Cerrar visita guarda el borrador en un solo batch y dispara el cierre', async () => {
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const cerrarBtn = await screen.findByRole('button', { name: /cerrar visita/i })
    expect(cerrarBtn).toBeEnabled()
    fireEvent.click(cerrarBtn)

    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    // Filtros no cambió respecto de lo que ya traía el servidor: no se manda su PUT.
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
    expect(onCerrarVisita).toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).toBeNull()
})

it('si el batch de cierre falla, no limpia el borrador ni dispara el cierre', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))

    expect(await screen.findByText(/no se pudo guardar la resolución de algunos rubros/i)).toBeInTheDocument()
    expect(onCerrarVisita).not.toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).not.toBeNull()
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

it('desde la lista se puede agregar un rubro fuera de la propuesta', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    fireEvent.click(await screen.findByText('Baterías'))
    await waitFor(() =>
        expect(api.agregarRubro).toHaveBeenCalledWith(42, {
            rubroCode: 'BAT',
            rubroDescripcion: 'Baterías',
        }),
    )
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})

it('el buscador no ofrece rubros que ya están en la visita', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

it('no ofrece agregar rubros cuando la visita ya está cerrada', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /agregar rubro/i })).not.toBeInTheDocument()
})
