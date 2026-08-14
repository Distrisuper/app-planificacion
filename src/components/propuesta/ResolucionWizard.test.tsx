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
                detalles={{}}
                onCambiarAccion={vi.fn()}
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
                ofrecimientos={ofrecimientos}
                index={index}
                motivos={motivos}
                borradores={{ 7: [], 8: [] }}
                onCambiarBorrador={vi.fn()}
                detalles={{}}
                onCambiarAccion={vi.fn()}
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
    ;(api.eliminarOfrecimiento as any).mockResolvedValue(undefined)
    ;(api.getAcciones as any).mockResolvedValue([])
})

it('muestra la posición y el ofrecimiento actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('la barra tiene un segmento por ofrecimiento y marca en cuál se está', () => {
    setup()
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '1')
    expect(barra).toHaveAttribute('aria-valuemax', '2')
    expect(barra.children).toHaveLength(2)
})

it('el segmento de un ofrecimiento ya resuelto va en verde; el que tiene el detalle a medias, no', () => {
    // Ofrecimiento 7: motivo simple tildado ⇒ completo. Ofrecimiento 8: Precio
    // (requiereDetalle) sin detalle ⇒ sigue contando como pendiente, igual que en el
    // chip de la tabla.
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

it('avanzar de ofrecimiento entra desde la derecha, y volver desde la izquierda', () => {
    const irA = setupNavegable()
    const cuerpo = () => screen.getByText('Saqué pedido').closest('[class*="animate-rubro"]')
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(1)
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(0)
    expect(cuerpo()?.className).toContain('animate-rubro-atras')
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

it('sin acción ni marca cargada, no ofrece el check de aplicar a los restantes', () => {
    // Con motivos tildados pero SIN acción/marca tampoco se ofrece: lo que se replica
    // es acción+marca, nunca la resolución.
    setup({ borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] } })
    expect(screen.queryByText(/aplicar esta acción y marca/i)).not.toBeInTheDocument()
})

it('con acción cargada, ofrece aplicarla a los rubros restantes', () => {
    setup({ detalles: { 7: { accion: 'CUPO', marca: null } } })
    expect(screen.getByText('Aplicar esta acción y marca a los 1 rubros restantes')).toBeInTheDocument()
})

it('tildar el check replica SOLO la acción y la marca, nunca la resolución', () => {
    const onCambiarBorrador = vi.fn()
    const onCambiarAccion = vi.fn()
    setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        detalles: { 7: { accion: 'CUPO', marca: 'AG' } },
        onCambiarBorrador,
        onCambiarAccion,
    })

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onCambiarAccion).toHaveBeenCalledWith(8, { accion: 'CUPO', marca: 'AG' })
    expect(onCambiarBorrador).not.toHaveBeenCalled()
})

it('con un solo rubro en el wizard, no ofrece el check: no hay restantes', () => {
    setup({
        ofrecimientos: [ofrecimientos[0]],
        detalles: { 7: { accion: 'CUPO', marca: null } },
    })
    expect(screen.queryByText(/aplicar esta acción y marca/i)).not.toBeInTheDocument()
})
