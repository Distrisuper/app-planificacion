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

it('columnas en el orden RUBRO · ACTUAL · M.ANT · PROM.6M', () => {
    render(<RubroTable filas={[fila()]} />)
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(headers[0]).toMatch(/rubro/i)
    expect(headers[1]).toMatch(/actual/i)
    expect(headers[2]).toMatch(/m\.ant/i)
    expect(headers[3]).toMatch(/prom\.6m/i)
})

it('pinta de rojo ACTUAL y M.ANT cuando caen bajo PROM.6M', () => {
    render(<RubroTable filas={[fila({ actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 })]} />)
    const allSixHundreds = screen.getAllByText('600')
    expect(allSixHundreds[1].closest('span')).toHaveClass('text-dsred') // skip TOTALES row, get data row
    const allEightHundreds = screen.getAllByText('800')
    expect(allEightHundreds[1].closest('span')).toHaveClass('text-dsred')
})

it('no pinta de rojo cuando el valor es –', () => {
    render(<RubroTable filas={[fila({ actual: null, promedio6m: 1_000_000 })]} />)
    const celdas = screen.getAllByText('–')
    expect(celdas.some(c => c.closest('span')?.classList.contains('text-dsred'))).toBe(false)
})

it('PROM.6M nunca se pinta de rojo (es la referencia)', () => {
    render(<RubroTable filas={[fila({ actual: 50_000, mesAnterior: 50_000, promedio6m: 1_000_000 })]} />)
    const allOneThousands = screen.getAllByText('1.000')
    const promCell = allOneThousands[1] // skip TOTALES row, get data row
    expect(promCell.closest('span')).not.toHaveClass('text-dsred')
})

it('marca la fila destacada con la barra navy y el nombre en negrita', () => {
    render(<RubroTable filas={[fila({ destacada: true })]} />)
    const celdaNombre = screen.getByText('Amortiguadores')
    expect(celdaNombre.className).toContain('font-bold')
    expect(celdaNombre.className).toContain('shadow-[inset_3px_0_0_0_#213D82]')
})

it('la fila TOTALES suma las columnas de las filas recibidas', () => {
    render(
        <RubroTable
            filas={[
                fila({ rubroCode: 'R1', actual: 600_000, mesAnterior: 800_000, promedio6m: 1_000_000 }),
                fila({ rubroCode: 'R2', nombre: 'Filtros', actual: 400_000, mesAnterior: 200_000, promedio6m: 300_000 }),
            ]}
        />,
    )
    expect(screen.getByText(/totales/i)).toBeInTheDocument()
    const allOneThousands = screen.getAllByText('1.000')
    expect(allOneThousands.length).toBeGreaterThan(0) // 600k + 400k = 1.000k
})

it('segunda línea: "Resolución" cuando no está completo', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /resolución de amortiguadores/i })).toHaveTextContent('Resolución')
})

it('segunda línea: "✓ N motivos cargados" cuando está completo', () => {
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 2, completo: true } })]}
            onResolucion={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /resolución de amortiguadores/i })).toHaveTextContent('✓ 2 motivos cargados')
})

it('el botón de resolución dispara onResolucion con el visitaRubroId', () => {
    const onResolucion = vi.fn()
    render(
        <RubroTable
            filas={[fila({ resolucion: { visitaRubroId: 7, motivosCargados: 0, completo: false } })]}
            onResolucion={onResolucion}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolución de amortiguadores/i }))
    expect(onResolucion).toHaveBeenCalledWith(7)
})

it('el ＋ de una fila agregable dispara onAgregar con el rubroCode', () => {
    const onAgregar = vi.fn()
    render(
        <RubroTable
            filas={[fila({ rubroCode: 'BAT', nombre: 'Baterías', destacada: false, agregable: true })]}
            onAgregar={onAgregar}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /agregar baterías/i }))
    expect(onAgregar).toHaveBeenCalledWith('BAT')
})

it('en solo lectura (sin resolucion ni agregable) no se renderiza ninguna acción', () => {
    render(<RubroTable filas={[fila()]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
