import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
import * as api from '@/api/planificacion'
import type { IMotivo, IVisitaRubro } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

const rubros: IVisitaRubro[] = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [],
    },
]

function setup(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCambiarBorrador = vi.fn()
    const onVolver = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <ResolucionWizard
                rubros={rubros}
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
})

it('muestra la posición y el rubro actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('tildar un motivo avisa con el rubro actual', () => {
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
