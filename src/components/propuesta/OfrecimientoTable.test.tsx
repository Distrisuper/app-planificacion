import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import OfrecimientoTable from './OfrecimientoTable'
import type { IOfrecimientoFila } from './filas'

function fila(over: Partial<IOfrecimientoFila> = {}): IOfrecimientoFila {
    return {
        codigo: 'R1',
        nombre: 'Amortiguadores',
        actual: 600_000,
        mesAnterior: 800_000,
        promedio6m: 1_000_000,
        destacada: true,
        tipo: 'rubro',
        alcance: [],
        ...over,
    }
}

it('columnas en el orden RUBRO · ACTUAL · M.ANT · P.6M', () => {
    render(<OfrecimientoTable filas={[fila()]} />)
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(headers[0]).toMatch(/rubro/i)
    expect(headers[1]).toMatch(/actual/i)
    expect(headers[2]).toMatch(/m\.ant/i)
    expect(headers[3]).toMatch(/p\.6m/i)
})

it('pinta de rojo ACTUAL y M.ANT cuando caen bajo P.6M', () => {
    render(<OfrecimientoTable filas={[fila({ actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })]} />)
    expect(screen.getByText('600').closest('span')).toHaveClass('text-dsred')
    expect(screen.getByText('800').closest('span')).toHaveClass('text-dsred')
})

it('no pinta de rojo cuando el valor es –', () => {
    render(<OfrecimientoTable filas={[fila({ actual: null, promedio6m: 1_000_000 })]} />)
    const celdas = screen.getAllByText('–')
    expect(celdas.some(c => c.closest('span')?.classList.contains('text-dsred'))).toBe(false)
})

it('P.6M nunca se pinta de rojo (es la referencia)', () => {
    render(<OfrecimientoTable filas={[fila({ actual: 50_000, mesAnterior: 50_000, promedio6m: 1_000_000 })]} />)
    const promCell = screen.getByText('1.000')
    expect(promCell.closest('span')).not.toHaveClass('text-dsred')
})

it('sin filas fuera de la propuesta/visita, no muestra separador de sección', () => {
    render(<OfrecimientoTable filas={[fila({ destacada: true })]} />)
    expect(screen.queryByText(/otros rubros del cliente/i)).not.toBeInTheDocument()
})

it('con filas destacadas y no destacadas mezcladas, separa con una etiqueta', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', destacada: true }),
                fila({ codigo: 'R2', nombre: 'Filtros', destacada: false }),
            ]}
        />,
    )
    expect(screen.getByText(/otros rubros del cliente/i)).toBeInTheDocument()
})

it('si el bloque de otros rubros es agregable, la etiqueta invita a tocar', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', destacada: true }),
                fila({ codigo: 'R2', nombre: 'Filtros', destacada: false, agregable: true }),
            ]}
        />,
    )
    expect(screen.getByText(/tocá uno para agregarlo/i)).toBeInTheDocument()
})

it('si el bloque de otros rubros es de solo lectura, la etiqueta no invita a tocar', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', destacada: true }),
                fila({ codigo: 'R2', nombre: 'Filtros', destacada: false }),
            ]}
        />,
    )
    expect(screen.queryByText(/tocá uno para agregarlo/i)).not.toBeInTheDocument()
})

it('sin otros rubros, no se muestra el buscador', () => {
    render(<OfrecimientoTable filas={[fila({ destacada: true })]} />)
    expect(screen.queryByPlaceholderText(/buscar rubro/i)).not.toBeInTheDocument()
})

it('con otros rubros, el buscador filtra esa sección sin tocar el bloque de arriba', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', nombre: 'Amortiguadores', destacada: true }),
                fila({ codigo: 'R2', nombre: 'Baterías', destacada: false }),
                fila({ codigo: 'R3', nombre: 'Filtros de aceite', destacada: false }),
            ]}
        />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar rubro/i), { target: { value: 'filt' } })

    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros de aceite')).toBeInTheDocument()
    expect(screen.queryByText('Baterías')).not.toBeInTheDocument()
})

it('el buscador ignora acentos y mayúsculas', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', destacada: true }),
                fila({ codigo: 'R2', nombre: 'BATERÍAS', destacada: false }),
            ]}
        />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar rubro/i), { target: { value: 'baterias' } })
    expect(screen.getByText('BATERÍAS')).toBeInTheDocument()
})

it('sin resultados en la búsqueda, muestra el mensaje en vez de la lista', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'R1', destacada: true }),
                fila({ codigo: 'R2', nombre: 'Baterías', destacada: false }),
            ]}
        />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar rubro/i), { target: { value: 'zzz' } })
    expect(screen.queryByText('Baterías')).not.toBeInTheDocument()
    expect(screen.getByText(/sin resultados para "zzz"/i)).toBeInTheDocument()
})

it('no hay ninguna fila de totales', () => {
    render(<OfrecimientoTable filas={[fila({ codigo: 'R1' }), fila({ codigo: 'R2', nombre: 'Filtros' })]} />)
    expect(screen.queryByText(/totales/i)).not.toBeInTheDocument()
})

it('la fila resoluble es una sola línea: toda la fila (nombre incluido) es el botón', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    const boton = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(boton).toContainElement(screen.getByText('Amortiguadores'))
})

it('sin ningún motivo cargado el chip muestra ＋ (invita a tocar), no un círculo vacío', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    const boton = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(boton.querySelector('.lucide-plus')).toBeTruthy()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
})

it('el chip muestra la cantidad de motivos mientras el rubro está incompleto', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 2, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.getByText('2')).toBeInTheDocument()
})

it('el chip de un rubro completo no muestra la cantidad (va el ✓)', () => {
    const { container } = render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 2, completo: true, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(container.querySelector('.bg-\\[\\#EAF7EF\\]')).toBeTruthy()
})

it('el botón de resolución dispara onResolucion con el ofrecimientoId', () => {
    const onResolucion = vi.fn()
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={onResolucion}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolución de amortiguadores/i }))
    expect(onResolucion).toHaveBeenCalledWith(7)
})

it('un rubro de la propuesta no ofrece Quitar rubro', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('un rubro agregado dinámicamente (no propuesto) ofrece Quitar rubro junto a Resolución', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
            onResolucion={vi.fn()}
            onEliminar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /quitar amortiguadores/i })).toBeInTheDocument()
})

it('el botón Quitar rubro dispara onEliminar con el ofrecimientoId', () => {
    const onEliminar = vi.fn()
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
            onResolucion={vi.fn()}
            onEliminar={onEliminar}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /quitar amortiguadores/i }))
    expect(onEliminar).toHaveBeenCalledWith(7)
})

it('Quitar rubro en vuelo (eliminandoIds) queda deshabilitado', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
            onResolucion={vi.fn()}
            onEliminar={vi.fn()}
            eliminandoIds={new Set([7])}
        />,
    )
    expect(screen.getByRole('button', { name: /quitar amortiguadores/i })).toBeDisabled()
})

it('toda la fila agregable es el botón: tocarla dispara onAgregar con el rubroCode', () => {
    const onAgregar = vi.fn()
    render(
        <OfrecimientoTable
            filas={[fila({ codigo: 'BAT', nombre: 'Baterías', destacada: false, agregable: true })]}
            onAgregar={onAgregar}
        />,
    )
    const boton = screen.getByRole('button', { name: /agregar baterías/i })
    expect(boton).toContainElement(screen.getByText('Baterías'))
    fireEvent.click(boton)
    expect(onAgregar).toHaveBeenCalledWith('BAT')
})

it('una fila agregable en vuelo (agregandoCodes) queda deshabilitada', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ codigo: 'BAT', nombre: 'Baterías', destacada: false, agregable: true })]}
            onAgregar={vi.fn()}
            agregandoCodes={new Set(['rubro:BAT'])}
        />,
    )
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
})

it('con varias filas agregables en vuelo a la vez, solo las que están en agregandoCodes quedan deshabilitadas', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'BAT', nombre: 'Baterías', destacada: false, agregable: true }),
                fila({ codigo: 'FILT', nombre: 'Filtros', destacada: false, agregable: true }),
            ]}
            onAgregar={vi.fn()}
            agregandoCodes={new Set(['rubro:BAT', 'rubro:FILT'])}
        />,
    )
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /agregar filtros/i })).toBeDisabled()
})

it('en solo lectura (sin resolucion ni agregable) no se renderiza ninguna acción', () => {
    render(<OfrecimientoTable filas={[fila()]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('muestra el alcance de una acción', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'CUPO',
                    nombre: 'Plan cupo',
                    tipo: 'accion',
                    alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
                    resolucion: { ofrecimientoId: 9, motivosCargados: 0, completo: false, esPropuesto: false },
                }),
            ]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.getByText('Plan cupo')).toBeInTheDocument()
    expect(screen.getByText('SKF')).toBeInTheDocument()
})

it('un rubro común no muestra chip de tipo', () => {
    render(<OfrecimientoTable filas={[fila({ tipo: 'rubro' })]} />)
    const chips = screen.queryAllByText('Rubro').filter(el => el.getAttribute('role') !== 'columnheader')
    expect(chips).toHaveLength(0)
})

// Las columnas ACTUAL/M.ANT/P.6M son venta histórica por rubro: una acción (Plan cupo,
// Descuento) no tiene ese dato — mostrarlas en guiones es ruido, no "falta cargar".
it('una fila de acción no muestra las columnas ACTUAL/M.ANT/P.6M', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'CUPO',
                    nombre: 'Plan cupo',
                    tipo: 'accion',
                    actual: 600_000,
                    mesAnterior: 800_000,
                    promedio6m: 1_000_000,
                }),
            ]}
        />,
    )
    expect(screen.getByText('Plan cupo')).toBeInTheDocument()
    expect(screen.queryByText('600')).not.toBeInTheDocument()
    expect(screen.queryByText('800')).not.toBeInTheDocument()
    expect(screen.queryByText('1.000')).not.toBeInTheDocument()
})

it('una fila de rubro sigue mostrando sus tres columnas numéricas', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ tipo: 'rubro', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })]}
        />,
    )
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('1.000')).toBeInTheDocument()
})

it('una fila de Cupo con detalle muestra el resumen de tramos', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'CUPO',
                    nombre: 'Plan cupo',
                    tipo: 'accion',
                    detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
                }),
            ]}
        />,
    )
    expect(screen.getByText('$2.500.000→3%')).toBeInTheDocument()
})

it('una fila con detalle pero sin módulo registrado para su código no rompe ni muestra nada', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'PROMO',
                    nombre: 'Promo verano',
                    tipo: 'accion',
                    detalle: { algo: 'lo que sea' },
                }),
            ]}
        />,
    )
    expect(screen.getByText('Promo verano')).toBeInTheDocument()
})

it('con una acción, aparece la sección "Acciones" arriba de la tabla', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'CUPO', nombre: 'Plan cupo', tipo: 'accion' }),
                fila({ codigo: 'R1', nombre: 'Amortiguadores', tipo: 'rubro' }),
            ]}
        />,
    )
    expect(screen.getByText('Acciones')).toBeInTheDocument()
    expect(screen.getByText('Plan cupo')).toBeInTheDocument()
})

it('sin ninguna acción, no aparece la etiqueta "Acciones"', () => {
    render(<OfrecimientoTable filas={[fila({ codigo: 'R1', tipo: 'rubro' })]} />)
    expect(screen.queryByText('Acciones')).not.toBeInTheDocument()
})

it('una acción del bloque de arriba dispara onResolucion con su ofrecimientoId', () => {
    const onResolucion = vi.fn()
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'CUPO',
                    nombre: 'Plan cupo',
                    tipo: 'accion',
                    resolucion: { ofrecimientoId: 9, motivosCargados: 0, completo: false, esPropuesto: true },
                }),
            ]}
            onResolucion={onResolucion}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolución de plan cupo/i }))
    expect(onResolucion).toHaveBeenCalledWith(9)
})

it('una fila de marca no muestra las columnas ACTUAL/M.ANT/P.6M', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'AG',
                    nombre: 'AG',
                    tipo: 'marca',
                    actual: 600_000,
                    mesAnterior: 800_000,
                    promedio6m: 1_000_000,
                }),
            ]}
        />,
    )
    expect(screen.getByText('AG')).toBeInTheDocument()
    expect(screen.queryByText('600')).not.toBeInTheDocument()
    expect(screen.queryByText('800')).not.toBeInTheDocument()
    expect(screen.queryByText('1.000')).not.toBeInTheDocument()
})

it('con una marca, aparece la sección "Marcas" arriba de la tabla de rubros', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'AG', nombre: 'AG', tipo: 'marca' }),
                fila({ codigo: 'R1', nombre: 'Amortiguadores', tipo: 'rubro' }),
            ]}
        />,
    )
    expect(screen.getByText('Marcas')).toBeInTheDocument()
    expect(screen.getByText('AG')).toBeInTheDocument()
})

it('sin ninguna marca, no aparece la etiqueta "Marcas"', () => {
    render(<OfrecimientoTable filas={[fila({ codigo: 'R1', tipo: 'rubro' })]} />)
    expect(screen.queryByText('Marcas')).not.toBeInTheDocument()
})

it('una marca del bloque de arriba dispara onResolucion con su ofrecimientoId', () => {
    const onResolucion = vi.fn()
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'AG',
                    nombre: 'AG',
                    tipo: 'marca',
                    resolucion: { ofrecimientoId: 11, motivosCargados: 0, completo: false, esPropuesto: true },
                }),
            ]}
            onResolucion={onResolucion}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolución de ag/i }))
    expect(onResolucion).toHaveBeenCalledWith(11)
})

it('con acción y marca a la vez, cada una aparece en su propia sección', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({ codigo: 'CUPO', nombre: 'Plan cupo', tipo: 'accion' }),
                fila({ codigo: 'AG', nombre: 'AG', tipo: 'marca' }),
                fila({ codigo: 'R1', nombre: 'Amortiguadores', tipo: 'rubro' }),
            ]}
        />,
    )
    expect(screen.getByText('Acciones')).toBeInTheDocument()
    expect(screen.getByText('Marcas')).toBeInTheDocument()
})
