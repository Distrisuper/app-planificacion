import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
import * as api from '@/api/planificacion'
import type { IMotivo, IOfrecimiento } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

const ofrecimientos: IOfrecimiento[] = [
    {
        id: 7, resolucionId: 42, tipo: 'rubro', codigo: 'AMORT', descripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [], alcance: [],
    },
    {
        id: 8, resolucionId: 42, tipo: 'rubro', codigo: 'FILT', descripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
    },
]

function setup(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCambiarBorrador = vi.fn()
    const onVolver = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <ResolucionWizard
                visitaId={42}
                ofrecimientos={ofrecimientos}
                index={0}
                motivos={motivos}
                borradores={{ 7: [], 8: [] }}
                onCambiarBorrador={onCambiarBorrador}
                onVolver={onVolver}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCambiarBorrador, onVolver }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
    ;(api.eliminarOfrecimiento as any).mockResolvedValue(undefined)
})

it('muestra la posición y el ofrecimiento actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('tildar un motivo avisa con el ofrecimiento actual', () => {
    const { onCambiarBorrador } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onCambiarBorrador).toHaveBeenCalledWith(7, [
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('Volver dispara onVolver', () => {
    const { onVolver } = setup()
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})

it('no pide el catálogo de marcas si ningún motivo tildado lo necesita', () => {
    setup()
    // Son vendedores en la calle: no se paga un catálogo de cientos de marcas hasta
    // que alguien tilda un motivo que pide detalle.
    expect(api.getBrandCatalog).not.toHaveBeenCalled()
})

it('pide el catálogo de marcas cuando hay tildado un motivo con detalle', async () => {
    setup({
        borradores: {
            7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }],
            8: [],
        },
    })
    await waitFor(() => expect(api.getBrandCatalog).toHaveBeenCalled())
})

it('ofrece "Quitar" para un ofrecimiento que no es de la propuesta', () => {
    setup({ index: 1 }) // ofrecimientos[1] = Filtros, esPropuesto: false
    expect(screen.getByRole('button', { name: /quitar filtros/i })).toBeInTheDocument()
})

it('no ofrece "Quitar" para un ofrecimiento de la propuesta', () => {
    setup({ index: 0 }) // ofrecimientos[0] = Amortiguadores, esPropuesto: true
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('"Quitar" llama al backend y vuelve a la lista', async () => {
    const { onVolver } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarOfrecimiento).toHaveBeenCalledWith(42, 8))
    expect(onVolver).toHaveBeenCalled()
})

it('si falla el borrado, muestra el error y no vuelve a la lista', async () => {
    ;(api.eliminarOfrecimiento as any).mockRejectedValue(new Error('offline'))
    const { onVolver } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(onVolver).not.toHaveBeenCalled()
})
