import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
import * as api from '@/api/planificacion'
import type { IMotivo, IOfrecimiento } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', codigo: null, campos: [] },
    {
        motivoId: 13,
        nivel: 'ofrecimiento',
        descripcion: 'Precio',
        resultado: 'perdido',
        codigo: 'PRECIO',
        campos: [
            { campo: 'marca', tipo: 'catalogo_marca', label: 'Marca', placeholder: null, unidad: null, requerido: true, orden: 10 },
            { campo: 'competidor', tipo: 'texto', label: 'Competidor', placeholder: 'Ej. Corven', unidad: null, requerido: true, orden: 20 },
            { campo: 'precio_competidor', tipo: 'numero', label: 'Precio del competidor', placeholder: null, unidad: '$', requerido: true, orden: 30 },
            { campo: 'mi_precio', tipo: 'numero', label: 'Mi precio', placeholder: null, unidad: '$', requerido: true, orden: 40 },
        ],
    },
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
    const onCambiarMarcasOfrecidas = vi.fn()
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
                marcasPorRubro={{}}
                marcasOfrecidas={{}}
                onCambiarMarcasOfrecidas={onCambiarMarcasOfrecidas}
                onVolver={onVolver}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCambiarBorrador, onVolver, onCambiarMarcasOfrecidas }
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
                marcasPorRubro={{}}
                marcasOfrecidas={{}}
                onCambiarMarcasOfrecidas={vi.fn()}
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
})

it('muestra la posición y el ofrecimiento actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('sin nada cargado, no ofrece el botón de limpiar', () => {
    setup()
    expect(screen.queryByLabelText(/limpiar/i)).not.toBeInTheDocument()
})

it('con motivos tildados, ofrece limpiar y lo vacía', () => {
    const onCambiarBorrador = vi.fn()
    const onCambiarAccion = vi.fn()
    setup({
        borradores: { 7: [{ motivoId: 10, valores: {} }], 8: [] },
        onCambiarBorrador,
        onCambiarAccion,
    })

    fireEvent.click(screen.getByLabelText(/limpiar/i))

    expect(onCambiarBorrador).toHaveBeenCalledWith(7, [])
    expect(onCambiarAccion).toHaveBeenCalledWith(7, null)
})

it('con acción cargada (sin motivos), también ofrece limpiar', () => {
    setup({ detalles: { 7: { accion: 'CUPO', marca: null } } })
    expect(screen.getByLabelText(/limpiar/i)).toBeInTheDocument()
})

it('avanzar de ofrecimiento entra desde la derecha, y volver desde la izquierda', () => {
    const irA = setupNavegable()
    // "Precio" solo como ancla para llegar al contenedor animado: es el motivo que el
    // formulario muestra por defecto (Objeción es el segmento inicial).
    const cuerpo = () => screen.getByText('Precio').closest('[class*="animate-rubro"]')
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(1)
    expect(cuerpo()?.className).toContain('animate-rubro-adelante')

    irA(0)
    expect(cuerpo()?.className).toContain('animate-rubro-atras')
})

it('tildar un motivo avisa con el ofrecimiento actual', () => {
    const { onCambiarBorrador } = setup()
    // "Saqué pedido" es `ganado`: vive detrás del segmento Cierre.
    fireEvent.click(screen.getByRole('button', { name: /cierre/i }))
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onCambiarBorrador).toHaveBeenCalledWith(7, [
        { motivoId: 10, valores: {} },
    ])
})

it('Volver dispara onVolver', () => {
    const { onVolver } = setup()
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})

it('pide el catálogo de marcas siempre que el wizard está abierto', async () => {
    // Los chips de "¿Qué marca ofreciste?" lo necesitan para "+ Otra", tenga o no
    // tildado un motivo con detalle (antes solo pedía el catálogo por PRECIO).
    setup()
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

const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }

it('muestra los chips del rubro actual y tildar uno escribe el borrador de marcas', async () => {
    const { onCambiarMarcasOfrecidas } = setup({ marcasPorRubro: { AMORT: [fremax] } })
    fireEvent.click(await screen.findByRole('button', { name: /FREMAX/ }))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(7, [{ codigo: 'B1', descripcion: 'FREMAX' }])
})

it('sin nada tildado no ofrece Aplicar a restantes', () => {
    setup({ marcasPorRubro: { AMORT: [fremax] } })
    expect(screen.queryByText(/aplicar a restantes/i)).not.toBeInTheDocument()
})

it('aplicar copia las marcas a los rubros restantes SIN marcas, sin tocar los que ya tienen', () => {
    const { onCambiarMarcasOfrecidas } = setup({
        ofrecimientos: [...ofrecimientos, { ...ofrecimientos[1], id: 9, codigo: 'ROD', descripcion: 'Rod rueda' }],
        marcasOfrecidas: { 7: [{ codigo: 'B1', descripcion: 'FREMAX' }], 8: [], 9: [{ codigo: 'B9', descripcion: 'SKF' }] },
    })
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledTimes(1)
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(8, [{ codigo: 'B1', descripcion: 'FREMAX' }])
})

// Se copia la MARCA, no el código: SKF de ROD BOLA es una línea (097) y la de FILT es
// otra. Copiar el código dejaba el rubro de destino con la línea de otro rubro.
it('aplicar guarda en cada rubro la línea de la marca en ESE rubro', async () => {
    ;(api.getBrandCatalog as any).mockResolvedValue([
        { code: '096', description: 'SKF', lineaPorRubro: { AMORT: '097', FILT: '104' } },
    ])
    const { onCambiarMarcasOfrecidas } = setup({
        marcasOfrecidas: { 7: [{ codigo: '097', descripcion: 'SKF' }], 8: [] },
    })
    await waitFor(() => expect(api.getBrandCatalog).toHaveBeenCalled())
    await screen.findByLabelText(/aplicar a restantes/i)
    // Espera a que el catálogo esté en el componente (no solo pedido) antes de aplicar.
    await new Promise(r => setTimeout(r, 0))
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(8, [{ codigo: '104', descripcion: 'SKF' }])
})

it('aplicar prefiere la línea que el cliente compra en el rubro de destino', () => {
    const skf = { code: '132', nombre: 'SKF', actual: 0, mesAnterior: 0, promedio6m: 0, dejo: false }
    const { onCambiarMarcasOfrecidas } = setup({
        marcasPorRubro: { FILT: [skf] },
        marcasOfrecidas: { 7: [{ codigo: '097', descripcion: 'SKF' }], 8: [] },
    })
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(8, [{ codigo: '132', descripcion: 'SKF' }])
})

it('Limpiar vacía también las marcas', () => {
    const { onCambiarMarcasOfrecidas } = setup({ marcasOfrecidas: { 7: [{ codigo: 'B1', descripcion: 'FREMAX' }] } })
    fireEvent.click(screen.getByLabelText(/limpiar lo cargado/i))
    expect(onCambiarMarcasOfrecidas).toHaveBeenCalledWith(7, [])
})
