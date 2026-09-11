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

it('sin ningún motivo cargado el chip es un anillo hueco, no un ＋ de agregar', () => {
    const { container } = render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    // Los tres estados del chip son un checklist, y la contraparte de un check verde es
    // una casilla sin tildar. El ＋ que este test fijaba significa "agregar algo
    // nuevo", que en ESTA misma tabla ya es otra acción (las filas agregables de "otros
    // rubros del cliente"): quedaba pegado al verbo equivocado. Lo que ese ＋
    // compensaba — que nada dijera que la fila se toca — hoy lo dice la banda de arriba.
    const boton = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(boton.querySelector('.lucide-plus')).toBeNull()
    expect(screen.queryByText('0')).not.toBeInTheDocument()

    const chip = container.querySelector('span[aria-hidden].rounded-full')
    expect(chip).toHaveClass('border-2', 'border-dsnavy', 'bg-white')
    expect(chip).not.toHaveClass('bg-dsnavy')
    expect(chip?.textContent).toBe('')
    expect(chip?.querySelector('svg')).toBeNull()
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

// El gesto va en una banda de ancho completo y NO en la columna Rubro: ahí mide
// ~60-100px en mobile y el texto salía truncado.
it('en la tabla de una visita, una banda propia dice el gesto de cargar', () => {
    render(
        <OfrecimientoTable
            filas={[fila({ resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
        />,
    )
    expect(screen.getByText(/tocá uno para cargar el resultado/i)).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Rubro')
})

it('en la propuesta (sin filas resolubles) no hay banda de cargar', () => {
    render(<OfrecimientoTable filas={[fila()]} />)
    expect(screen.queryByText(/tocá uno para cargar el resultado/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Rubro')
})


// jsdom no evalua media queries, asi que esto no prueba que la columna desaparezca: fija
// el PAREO. Si alguien esconde el header sin esconder la celda (o al reves), las tres
// columnas numericas quedan corridas entre si y el numero deja de caer bajo su rotulo.
it('M.Ant esconde header y celda con el mismo breakpoint, y solo esa columna', () => {
    const { container } = render(<OfrecimientoTable filas={[fila()]} />)
    const headers = screen.getAllByRole('columnheader')

    expect(headers[2].textContent).toMatch(/m\.ant/i)
    expect(headers[2].className).toContain('hidden')
    expect(headers[2].className).toContain('xs:block')
    // Las otras dos NO se esconden: ACTUAL es el dato del mes y P.6M la referencia contra
    // la que se arma la propuesta.
    expect(headers[1].className).not.toContain('hidden')
    expect(headers[3].className).not.toContain('hidden')

    // La celda de M.Ant acompana al header. Sin querySelector con la clase escapada:
    // el ":" de `xs:flex` hay que escaparlo en el selector y no sobrevive bien a las
    // capas de quoting. Buscar por className es directo y dice lo mismo.
    const celdas = [...container.querySelectorAll('div')].filter(d =>
        d.className.includes('xs:flex'),
    )
    expect(celdas).toHaveLength(1)
    expect(celdas[0].className).toContain('hidden')
    expect(celdas[0].textContent).toMatch(/800/)
})

// El header alinea con text-right (es `block`), no con justify-end: si alguna vez se le
// mete `flex`, su texto pasa a ser un item flex y text-right deja de tener efecto — el
// rotulo se corre a la izquierda y deja de coincidir con el numero de abajo.
it('los headers numericos no son contenedores flex', () => {
    render(<OfrecimientoTable filas={[fila()]} />)
    for (const h of screen.getAllByRole('columnheader').slice(1)) {
        expect(h.className).toContain('text-right')
        expect(h.className.split(/\s+/)).not.toContain('flex')
    }
})

it('una fila agregable lleva un ＋ discreto, y la resoluble un anillo', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'R1',
                    nombre: 'Amortiguadores',
                    resolucion: { ofrecimientoId: 7, motivosCargados: 0, completo: false, esPropuesto: true },
                }),
                fila({ codigo: 'R2', nombre: 'Bieletas', destacada: false, agregable: true }),
            ]}
            onAgregar={vi.fn()}
        />,
    )

    // El ＋ va SOLO en la fila que agrega. Es el verbo correcto para ese glifo, y es la
    // contracara del chip de la fila resoluble: ahi el rubro ya existe y se carga su
    // resultado, asi que ese es un anillo (ver ChipEstado).
    const agregable = screen.getByRole('button', { name: 'Agregar Bieletas' })
    expect(agregable.querySelector('.lucide-plus')).not.toBeNull()

    const resoluble = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(resoluble.querySelector('.lucide-plus')).toBeNull()
    expect(resoluble.querySelector('span[aria-hidden].rounded-full')).not.toBeNull()

    // Discreto a proposito: glifo pelado, sin circulo ni borde — agregar es opcional,
    // cargar el resultado es lo que bloquea el cierre.
    const slot = agregable.querySelector('span[aria-hidden]')
    expect(slot?.className).not.toContain('rounded-full')
    expect(slot?.className).not.toContain('border')
})

it('la propuesta previa no reserva el slot del chip: ahi ese espacio es ancho de nombre', () => {
    render(<OfrecimientoTable filas={[fila()]} />)
    // Ni resoluble ni agregable => 4 columnas y ningun spacer al principio.
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
    expect(document.querySelector('.lucide-plus')).toBeNull()
})
