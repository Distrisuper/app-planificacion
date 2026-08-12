import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import RubroTable from './RubroTable'
import type { IRubroFila } from './filas'

function fila(over: Partial<IRubroFila> = {}): IRubroFila {
    return {
        rubroCode: 'R1',
        nombre: 'Amortiguadores',
        actual: 600_000,
        mesAnterior: 800_000,
        promedio6m: 1_000_000,
        destacada: true,
        ...over,
    }
}

it('columnas en el orden RUBRO · ACTUAL · M.ANT · P.6M', () => {
    render(<RubroTable filas={[fila()]} />)
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(headers[0]).toMatch(/rubro/i)
    expect(headers[1]).toMatch(/actual/i)
    expect(headers[2]).toMatch(/m\.ant/i)
    expect(headers[3]).toMatch(/p\.6m/i)
})

it('pinta de rojo ACTUAL y M.ANT cuando caen bajo P.6M', () => {
    render(<RubroTable filas={[fila({ actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })]} />)
    expect(screen.getByText('600').closest('span')).toHaveClass('text-dsred')
    expect(screen.getByText('800').closest('span')).toHaveClass('text-dsred')
})

it('no pinta de rojo cuando el valor es –', () => {
    render(<RubroTable filas={[fila({ actual: null, promedio6m: 1_000_000 })]} />)
    const celdas = screen.getAllByText('–')
    expect(celdas.some(c => c.closest('span')?.classList.contains('text-dsred'))).toBe(false)
})

it('P.6M nunca se pinta de rojo (es la referencia)', () => {
    render(<RubroTable filas={[fila({ actual: 50_000, mesAnterior: 50_000, promedio6m: 1_000_000 })]} />)
    const promCell = screen.getByText('1.000')
    expect(promCell.closest('span')).not.toHaveClass('text-dsred')
})

it('sin filas fuera de la propuesta/visita, no muestra separador de sección', () => {
    render(<RubroTable filas={[fila({ destacada: true })]} />)
    expect(screen.queryByText(/otros rubros del cliente/i)).not.toBeInTheDocument()
})

it('con filas destacadas y no destacadas mezcladas, separa con una etiqueta', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'Filtros', destacada: false }),
            ]}
        />,
    )
    expect(screen.getByText(/otros rubros del cliente/i)).toBeInTheDocument()
})

it('si el bloque de otros rubros es agregable, la etiqueta invita a tocar', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'Filtros', destacada: false, agregable: true }),
            ]}
        />,
    )
    expect(screen.getByText(/tocá uno para agregarlo/i)).toBeInTheDocument()
})

it('si el bloque de otros rubros es de solo lectura, la etiqueta no invita a tocar', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'Filtros', destacada: false }),
            ]}
        />,
    )
    expect(screen.queryByText(/tocá uno para agregarlo/i)).not.toBeInTheDocument()
})

it('sin otros rubros, no se muestra el buscador', () => {
    render(<RubroTable filas={[fila({ destacada: true })]} />)
    expect(screen.queryByPlaceholderText(/buscar rubro/i)).not.toBeInTheDocument()
})

it('con otros rubros, el buscador filtra esa sección sin tocar el bloque de arriba', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', nombre: 'Amortiguadores', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'Baterías', destacada: false }),
                fila({ rubroCode: 'R3', nombre: 'Filtros de aceite', destacada: false }),
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
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'BATERÍAS', destacada: false }),
            ]}
        />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar rubro/i), { target: { value: 'baterias' } })
    expect(screen.getByText('BATERÍAS')).toBeInTheDocument()
})

it('sin resultados en la búsqueda, muestra el mensaje en vez de la lista', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', destacada: true }),
                fila({ rubroCode: 'R2', nombre: 'Baterías', destacada: false }),
            ]}
        />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar rubro/i), { target: { value: 'zzz' } })
    expect(screen.queryByText('Baterías')).not.toBeInTheDocument()
    expect(screen.getByText(/sin resultados para "zzz"/i)).toBeInTheDocument()
})

it('no hay ninguna fila de totales', () => {
    render(<RubroTable filas={[fila({ rubroCode: 'R1' }), fila({ rubroCode: 'R2', nombre: 'Filtros' })]} />)
    expect(screen.queryByText(/totales/i)).not.toBeInTheDocument()
})

it('la fila resoluble es una sola línea: toda la fila (nombre incluido) es el botón', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    const boton = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(boton).toContainElement(screen.getByText('Amortiguadores'))
})

it('sin ningún motivo cargado el chip muestra ＋ (invita a tocar), no un círculo vacío', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    const boton = screen.getByRole('button', { name: /resolución de amortiguadores/i })
    expect(boton.querySelector('.lucide-plus')).toBeTruthy()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
})

it('el chip muestra la cantidad de motivos mientras el rubro está incompleto', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 2, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.getByText('2')).toBeInTheDocument()
})

it('el chip de un rubro completo no muestra la cantidad (va el ✓)', () => {
    const { container } = render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 2, completo: true, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(container.querySelector('.bg-\\[\\#EAF7EF\\]')).toBeTruthy()
})

it('el botón de resolución dispara onResolucion con el visitaRubroId', () => {
    const onResolucion = vi.fn()
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={onResolucion}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolución de amortiguadores/i }))
    expect(onResolucion).toHaveBeenCalledWith(7)
})

it('un rubro de la propuesta no ofrece Quitar rubro', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.queryByRole('button', { name: /quitar amortiguadores/i })).not.toBeInTheDocument()
})

it('un rubro agregado dinámicamente (no propuesto) ofrece Quitar rubro junto a Resolución', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
            onResolucion={vi.fn()}
            onEliminar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /quitar amortiguadores/i })).toBeInTheDocument()
})

it('el botón Quitar rubro dispara onEliminar con el visitaRubroId', () => {
    const onEliminar = vi.fn()
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
            onResolucion={vi.fn()}
            onEliminar={onEliminar}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /quitar amortiguadores/i }))
    expect(onEliminar).toHaveBeenCalledWith(7)
})

it('Quitar rubro en vuelo (eliminandoIds) queda deshabilitado', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false, esPropuesto: false } })]}
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
        <RubroTable
            filas={[fila({ rubroCode: 'BAT', nombre: 'Baterías', destacada: false, agregable: true })]}
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
        <RubroTable
            filas={[fila({ rubroCode: 'BAT', nombre: 'Baterías', destacada: false, agregable: true })]}
            onAgregar={vi.fn()}
            agregandoCodes={new Set(['BAT'])}
        />,
    )
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
})

it('con varias filas agregables en vuelo a la vez, solo las que están en agregandoCodes quedan deshabilitadas', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'BAT', nombre: 'Baterías', destacada: false, agregable: true }),
                fila({ rubroCode: 'FILT', nombre: 'Filtros', destacada: false, agregable: true }),
            ]}
            onAgregar={vi.fn()}
            agregandoCodes={new Set(['BAT', 'FILT'])}
        />,
    )
    expect(screen.getByRole('button', { name: /agregar baterías/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /agregar filtros/i })).toBeDisabled()
})

it('en solo lectura (sin resolucion ni agregable) no se renderiza ninguna acción', () => {
    render(<RubroTable filas={[fila()]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
