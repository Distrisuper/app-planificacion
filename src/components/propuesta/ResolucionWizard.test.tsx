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
                visitaId={42}
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

/** Igual que `setup`, pero deja mover el índice como lo hace el pie del wizard: la
 *  dirección de la animación solo existe entre dos renders del mismo árbol. */
function setupNavegable() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wizard = ({ index }: { index: number }) => (
        <QueryClientProvider client={qc}>
            <ResolucionWizard
                visitaId={42}
                rubros={rubros}
                index={index}
                motivos={motivos}
                borradores={{ 7: [], 8: [] }}
                onCambiarBorrador={vi.fn()}
                onVolver={vi.fn()}
            />
        </QueryClientProvider>
    )
    const { rerender } = render(<Wizard index={0} />)
    return (index: number) => rerender(<Wizard index={index} />)
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
    ;(api.eliminarRubro as any).mockResolvedValue(undefined)
})

it('muestra la posición y el rubro actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('la barra tiene un segmento por rubro y marca en cuál se está', () => {
    setup()
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '1')
    expect(barra).toHaveAttribute('aria-valuemax', '2')
    expect(barra.children).toHaveLength(2)
})

it('el segmento de un rubro ya resuelto va en verde; el que tiene el detalle a medias, no', () => {
    // Rubro 7: motivo simple tildado ⇒ completo. Rubro 8: Precio (requiereDetalle) sin
    // detalle ⇒ sigue contando como pendiente, igual que en el chip de la tabla.
    setup({
        index: 1,
        borradores: {
            7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
            8: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }],
        },
    })
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-label', 'Rubro 2 de 2, 1 resueltos')
    expect(barra.children[0].className).toContain('bg-dsgreen')
    expect(barra.children[1].className).toContain('bg-dsnavy')
})

it('avanzar de rubro entra desde la derecha, y volver desde la izquierda', () => {
    const irA = setupNavegable()
    const cuerpo = () => screen.getByText('Saqué pedido').closest('[class*="animate-rubro"]')
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(1)
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(0)
    expect(cuerpo()?.className).toContain('animate-rubro-atras')
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

it('ofrece "Quitar rubro" para un rubro que no es de la propuesta', () => {
    setup({ index: 1 }) // rubros[1] = Filtros, esPropuesto: false
    expect(screen.getByRole('button', { name: /quitar filtros/i })).toBeInTheDocument()
})

it('no ofrece "Quitar rubro" para un rubro de la propuesta', () => {
    setup({ index: 0 }) // rubros[0] = Amortiguadores, esPropuesto: true
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('"Quitar rubro" llama al backend y vuelve a la lista', async () => {
    const { onVolver } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarRubro).toHaveBeenCalledWith(42, 8))
    expect(onVolver).toHaveBeenCalled()
})

it('si falla el borrado, muestra el error y no vuelve a la lista', async () => {
    ;(api.eliminarRubro as any).mockRejectedValue(new Error('offline'))
    const { onVolver } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(onVolver).not.toHaveBeenCalled()
})
