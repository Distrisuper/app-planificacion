import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'
import type { IVisitClientCard } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'ofrecimiento', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const CLIENTE: IVisitClientCard = {
    codigoCliente: '1-10034',
    codigoParticularCliente: '10034',
    nombreCliente: 'Almacén Don José',
}

const ofrecimientos = [
    {
        id: 7, resolucionId: 42, tipo: 'rubro', codigo: 'AMORT', descripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [], alcance: [],
    },
    {
        id: 8, resolucionId: 42, tipo: 'rubro', codigo: 'FILT', descripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: true,
        motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], alcance: [],
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
    ;(api.getOfrecimientos as any).mockResolvedValue(ofrecimientos)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverOfrecimiento as any).mockResolvedValue({ ofrecimientosPendientes: 0 })
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
    ])
    ;(api.agregarOfrecimiento as any).mockResolvedValue({ ofrecimientoId: 99 })
    ;(api.eliminarOfrecimiento as any).mockResolvedValue(undefined)
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
    ;(api.getAcciones as any).mockResolvedValue([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])
})

it('lista los rubros de la propuesta congelada', async () => {
    renderSheet()
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('pide el catálogo de nivel ofrecimiento, no el completo', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(api.getMotivos).toHaveBeenCalledWith('ofrecimiento')
})

it('el botón Resolución abre el wizard de resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})

it('finalizar cierra el wizard sin llamar al backend: el cambio queda en el borrador', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))

    // Volvió a la lista (el wizard ya no está) y el rubro quedó marcado como completo.
    expect(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' })).toBeInTheDocument()
    expect(screen.queryByText('2 de 2')).not.toBeInTheDocument()
    expect(api.resolverOfrecimiento).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^cerrar visita$/i })).toBeEnabled()
})

it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Saqué pedido').closest('button')).toHaveClass('border-[#B9CCEC]')
})

it('el cambio tildado en el wizard se persiste en localStorage al instante', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))

    await waitFor(() => {
        const borrador = JSON.parse(localStorage.getItem('visita-borrador-42') ?? '{}')
        expect(borrador[7]).toEqual([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    })
})

it('un rubro de la propuesta no se puede borrar (el wizard no ofrece Quitar)', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('un rubro que no es de la propuesta ofrece Quitar dentro del wizard', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Filtros' }))
    fireEvent.click(await screen.findByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarOfrecimiento).toHaveBeenCalledWith(42, 8))
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, ningún rubro se puede reabrir', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /resolución de/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, un rubro ya resuelto no ofrece borrarlo (no hay wizard al que entrar)', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
})

it('con rubros sin completar, Cerrar visita está deshabilitado y avisa cuántos faltan', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    // El faltante lo dice el propio botón deshabilitado, no una línea aparte en el pie.
    expect(screen.getByRole('button', { name: /faltan 1 rubro/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^cerrar visita$/i })).not.toBeInTheDocument()
})

it('con todos los rubros completos, Cerrar visita guarda el borrador en un solo batch y dispara el cierre', async () => {
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const cerrarBtn = await screen.findByRole('button', { name: /cerrar visita/i })
    expect(cerrarBtn).toBeEnabled()
    fireEvent.click(cerrarBtn)

    await waitFor(() =>
        expect(api.resolverOfrecimiento).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    expect(api.resolverOfrecimiento).toHaveBeenCalledTimes(1)
    expect(onCerrarVisita).toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).toBeNull()
})

it('si el batch de cierre falla, no limpia el borrador ni dispara el cierre', async () => {
    ;(api.resolverOfrecimiento as any).mockRejectedValue(new Error('Network Error'))
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
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

it('sin codigoParticularCliente no hay bloque de otros rubros del cliente', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByText(/otros rubros del cliente/i)).not.toBeInTheDocument()
})

it('con codigoParticularCliente, los números de rubroStatus aparecen en la tabla sin navegar', async () => {
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    await waitFor(() => expect(api.getRubroStatus).toHaveBeenCalledWith('10034'))
    const allBy1940 = screen.getAllByText('1.940')
    expect(allBy1940.length).toBeGreaterThan(0)
    expect(screen.getAllByText('2.600').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3.100').length).toBeGreaterThan(0)
})

it('visita sin rubros pero con otros rubros del cliente: la tabla se ve de una', async () => {
    ;(api.getOfrecimientos as any).mockResolvedValue([])
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    renderSheet({ codigoParticularCliente: '10034' })

    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Esta visita no tiene rubros propuestos.')).not.toBeInTheDocument()
})

it('el ＋ de un rubro fuera de la visita lo agrega y la fila sube al bloque de arriba con su botón de Resolución', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))

    await waitFor(() =>
        expect(api.agregarOfrecimiento).toHaveBeenCalledWith(42, {
            tipo: 'rubro',
            codigo: 'BAT',
            descripcion: 'Baterías',
        }),
    )
})

it('agregar dos rubros distintos en simultáneo deshabilita cada fila por separado, sin que la segunda apague el spinner de la primera', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
        { rubroCode: 'FOCO', nombre: 'Focos', actual: 200_000, mesAnterior: 150_000, promedio6m: 180_000 },
    ])
    const resolvers: Record<string, (v: { ofrecimientoId: number }) => void> = {}
    ;(api.agregarOfrecimiento as any).mockImplementation((_visitaId: number, dto: { codigo: string }) =>
        new Promise(resolve => {
            resolvers[dto.codigo] = resolve
        }),
    )
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar focos/i }))
    await waitFor(() => expect(api.agregarOfrecimiento).toHaveBeenCalledTimes(2))

    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /agregar focos/i })).toBeDisabled()

    resolvers.FOCO({ ofrecimientoId: 100 })
    await waitFor(() => expect(screen.getByRole('button', { name: /agregar focos/i })).not.toBeDisabled())
    // BAT sigue en vuelo: no se apagó por el settle de FOCO.
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()

    resolvers.BAT({ ofrecimientoId: 101 })
    await waitFor(() => expect(screen.getByRole('button', { name: /agregar baterías/i })).not.toBeDisabled())
})

// Dos tipos distintos pueden compartir código (ej. rubro "CUPO" y acción "CUPO"): la clave
// de agregandoCodes es `${tipo}:${codigo}`, no el código solo.
it('dos ofrecimientos del mismo código y distinto tipo no comparten el spinner', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'CUPO', nombre: 'Cupo', actual: 0, mesAnterior: 0, promedio6m: 0 },
    ])
    let resolverBat: (v: { ofrecimientoId: number }) => void = () => {}
    ;(api.agregarOfrecimiento as any).mockImplementation((_visitaId: number, dto: { tipo: string; codigo: string }) => {
        if (dto.tipo === 'rubro' && dto.codigo === 'CUPO') {
            return new Promise(resolve => {
                resolverBat = resolve
            })
        }
        return Promise.resolve({ ofrecimientoId: 200 })
    })
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')

    fireEvent.click(await screen.findByRole('button', { name: /agregar cupo/i }))
    expect(screen.getByRole('button', { name: /agregar cupo/i })).toBeDisabled()

    // Agregar la acción "CUPO" (mismo código, tipo distinto) desde el sheet no debería
    // tocar el spinner del rubro "CUPO" que sigue en vuelo.
    fireEvent.click(screen.getByRole('button', { name: /agregar otra cosa/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Acción' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Plan cupo' }))
    fireEvent.change(screen.getByLabelText(/tramo 1.*alcanza/i), { target: { value: '2500000' } })
    fireEvent.change(screen.getByLabelText(/tramo 1.*descuento/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }))

    await waitFor(() => expect(api.agregarOfrecimiento).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /agregar cupo/i })).toBeDisabled()

    resolverBat({ ofrecimientoId: 201 })
    await waitFor(() => expect(screen.getByRole('button', { name: /agregar cupo/i })).not.toBeDisabled())
})

it('el rubro recién agregado aparece arriba de todo, antes de los que ya estaban', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    ;(api.getOfrecimientos as any).mockResolvedValueOnce(ofrecimientos).mockResolvedValue([
        ...ofrecimientos,
        {
            id: 99, resolucionId: 42, tipo: 'rubro', codigo: 'BAT', descripcion: 'Baterías',
            gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
        },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    // Agregar abre el wizard del rubro nuevo; se vuelve a la lista para ver el orden.
    fireEvent.click(await screen.findByRole('button', { name: 'Volver' }))
    await screen.findByRole('button', { name: 'Resolución de Baterías' })

    const botones = screen.getAllByRole('button', { name: /^resolución de /i })
    expect(botones.map(b => b.getAttribute('aria-label'))).toEqual([
        'Resolución de Baterías',
        'Resolución de Amortiguadores',
        'Resolución de Filtros',
    ])
})

it('agregar un rubro del catálogo abre su resolución de una, sin volver a la lista', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    ;(api.getOfrecimientos as any).mockResolvedValueOnce(ofrecimientos).mockResolvedValue([
        ...ofrecimientos,
        {
            id: 99, resolucionId: 42, tipo: 'rubro', codigo: 'BAT', descripcion: 'Baterías',
            gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
        },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))

    // El wizard quedó parado en el rubro recién agregado, no en el primero de la lista.
    expect(await screen.findByRole('button', { name: 'Volver' })).toBeInTheDocument()
    expect(screen.getByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^resolución de /i })).not.toBeInTheDocument()
})

it('un rubro agregado se mantiene arriba aunque se resuelva (no se reordena por estado)', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    ;(api.getOfrecimientos as any).mockResolvedValueOnce(ofrecimientos).mockResolvedValue([
        ...ofrecimientos,
        {
            id: 99, resolucionId: 42, tipo: 'rubro', codigo: 'BAT', descripcion: 'Baterías',
            gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
        },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    // Agregar abre el wizard del rubro nuevo directamente: se resuelve ahí mismo, sin
    // volver a la lista a buscarlo.
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const botones = await screen.findAllByRole('button', { name: /^resolución de /i })
    expect(botones[0]).toHaveAttribute('aria-label', 'Resolución de Baterías')
    // Resuelto: el chip pasó a ✓ (no muestra la cantidad) sin que la fila se moviera.
    expect(botones[0]).toHaveTextContent('Baterías')
    expect(botones[0].querySelector('.bg-\\[\\#EAF7EF\\]')).toBeTruthy()
})

it('el botón Quitar rubro en la tabla llama al backend para un rubro que no es de la propuesta', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarOfrecimiento).toHaveBeenCalledWith(42, 8))
})

it('un rubro de la propuesta no ofrece Quitar en la tabla', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('si getRubroStatus falla, la tabla igual lista los ofrecimientos de la visita y el botón de Resolución funciona', async () => {
    ;(api.getRubroStatus as any).mockRejectedValue(new Error('offline'))
    renderSheet({ codigoParticularCliente: '10034' })
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.queryByText(/otros rubros del cliente/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})

it('con la visita cerrada, "otros rubros del cliente" no son tocables para agregar', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    renderSheet({ visitaCerrada: true, codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /agregar baterías/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, no ofrece "Agregar otra cosa"', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /agregar otra cosa/i })).not.toBeInTheDocument()
})

it('ofrece las apps externas cuando se le pasa el callback y el cliente', async () => {
    const onAbrirAppExterna = vi.fn()
    renderSheet({ cliente: CLIENTE, onAbrirAppExterna })
    fireEvent.click(await screen.findByRole('button', { name: 'Pagos' }))
    expect(onAbrirAppExterna).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pagos' }),
        CLIENTE,
    )
})

it('no muestra apps externas si no se le pasa el callback', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
})

it('dentro del wizard de resolución no aparecen las apps externas', async () => {
    renderSheet({ cliente: CLIENTE, onAbrirAppExterna: vi.fn() })
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
})
