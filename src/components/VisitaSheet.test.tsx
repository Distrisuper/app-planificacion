import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'
import type { IVisitClientCard } from '@/types/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const CLIENTE: IVisitClientCard = {
    codigoCliente: '1-10034',
    codigoParticularCliente: '10034',
    nombreCliente: 'Almacén Don José',
}

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
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
    ;(api.eliminarRubro as any).mockResolvedValue(undefined)
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
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

    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
    expect(api.resolverRubro).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Resolución de Amortiguadores' })).toHaveTextContent('✓ 1 motivo cargado')
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

it('un rubro de la propuesta no se puede borrar (el wizard no ofrece Quitar rubro)', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('un rubro que no es de la propuesta ofrece Quitar rubro dentro del wizard', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Filtros' }))
    fireEvent.click(await screen.findByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarRubro).toHaveBeenCalledWith(42, 8))
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
    expect(screen.getByText(/faltan completar 1 rubro para poder cerrar la visita/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
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
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
    expect(onCerrarVisita).toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).toBeNull()
})

it('si el batch de cierre falla, no limpia el borrador ni dispara el cierre', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
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

it('sin codigoParticularCliente no ofrece Ver más', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()
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

it('visita sin rubros pero con otros rubros del cliente: "Ver más" trae la tabla', async () => {
    ;(api.getRubros as any).mockResolvedValue([])
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    renderSheet({ codigoParticularCliente: '10034' })

    expect(await screen.findByText('Esta visita no tiene rubros propuestos.')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /ver más/i }))
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

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))

    await waitFor(() =>
        expect(api.agregarRubro).toHaveBeenCalledWith(42, { rubroCode: 'BAT', rubroDescripcion: 'Baterías' }),
    )
})

it('agregar dos rubros distintos en simultáneo deshabilita cada fila por separado, sin que la segunda apague el spinner de la primera', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
        { rubroCode: 'FOCO', nombre: 'Focos', actual: 200_000, mesAnterior: 150_000, promedio6m: 180_000 },
    ])
    const resolvers: Record<string, (v: { visitaRubroId: number }) => void> = {}
    ;(api.agregarRubro as any).mockImplementation((_visitaId: number, dto: { rubroCode: string }) =>
        new Promise(resolve => {
            resolvers[dto.rubroCode] = resolve
        }),
    )
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar focos/i }))
    await waitFor(() => expect(api.agregarRubro).toHaveBeenCalledTimes(2))

    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /agregar focos/i })).toBeDisabled()

    resolvers.FOCO({ visitaRubroId: 100 })
    await waitFor(() => expect(screen.getByRole('button', { name: /agregar focos/i })).not.toBeDisabled())
    // BAT sigue en vuelo: no se apagó por el settle de FOCO.
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()

    resolvers.BAT({ visitaRubroId: 101 })
    await waitFor(() => expect(screen.getByRole('button', { name: /agregar baterías/i })).not.toBeDisabled())
})

it('el rubro recién agregado aparece arriba de todo, antes de los que ya estaban', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    ;(api.getRubros as any).mockResolvedValueOnce(rubros).mockResolvedValue([
        ...rubros,
        {
            id: 99, resolucionId: 42, rubroCode: 'BAT', rubroDescripcion: 'Baterías',
            gapUnits: null, esPropuesto: false, resuelto: false, motivos: [],
        },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    await screen.findByRole('button', { name: 'Resolución de Baterías' })

    const botones = screen.getAllByRole('button', { name: /^resolución de /i })
    expect(botones.map(b => b.getAttribute('aria-label'))).toEqual([
        'Resolución de Baterías',
        'Resolución de Amortiguadores',
        'Resolución de Filtros',
    ])
})

it('un rubro agregado se mantiene arriba aunque se resuelva (no se reordena por estado)', async () => {
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 1_940_000, mesAnterior: 2_600_000, promedio6m: 3_100_000 },
        { rubroCode: 'BAT', nombre: 'Baterías', actual: 500_000, mesAnterior: 400_000, promedio6m: 300_000 },
    ])
    ;(api.getRubros as any).mockResolvedValueOnce(rubros).mockResolvedValue([
        ...rubros,
        {
            id: 99, resolucionId: 42, rubroCode: 'BAT', rubroDescripcion: 'Baterías',
            gapUnits: null, esPropuesto: false, resuelto: false, motivos: [],
        },
    ])
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')

    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agregar baterías/i }))
    await screen.findByRole('button', { name: 'Resolución de Baterías' })

    fireEvent.click(screen.getByRole('button', { name: 'Resolución de Baterías' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const botones = await screen.findAllByRole('button', { name: /^resolución de /i })
    expect(botones[0]).toHaveAttribute('aria-label', 'Resolución de Baterías')
    expect(botones[0]).toHaveTextContent('✓ 1 motivo cargado')
})

it('el botón Quitar rubro en la tabla llama al backend para un rubro que no es de la propuesta', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    fireEvent.click(screen.getByRole('button', { name: /quitar filtros/i }))
    await waitFor(() => expect(api.eliminarRubro).toHaveBeenCalledWith(42, 8))
})

it('un rubro de la propuesta no ofrece Quitar rubro en la tabla', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('si getRubroStatus falla, la tabla igual lista los rubros de la visita y el botón de Resolución funciona', async () => {
    ;(api.getRubroStatus as any).mockRejectedValue(new Error('offline'))
    renderSheet({ codigoParticularCliente: '10034' })
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()

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
    fireEvent.click(screen.getByRole('button', { name: /ver más/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /agregar baterías/i })).not.toBeInTheDocument()
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
