import { render, screen } from '@testing-library/react'
import VersusTable from './VersusTable'
import type { IRubroEstado } from '@/types/planificacion'

function rubro(over: Partial<IRubroEstado> = {}): IRubroEstado {
    return {
        rubroCode: 'R1',
        nombre: 'Amortiguadores',
        actual: 600,
        mesAnterior: 800,
        promedio6m: 1000,
        ...over,
    }
}

it('muestra una fila por rubro con actual, mes anterior y promedio 6M', () => {
    render(<VersusTable rubros={[rubro()]} />)

    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('1.000')).toBeInTheDocument()
})

it('resalta la celda actual cuando cae respecto al promedio de 6 meses', () => {
    render(<VersusTable rubros={[rubro({ actual: 600, promedio6m: 1000 })]} />)
    expect(screen.getByText('600')).toHaveClass('text-dsred')
})

it('no resalta la celda actual cuando no cae', () => {
    render(<VersusTable rubros={[rubro({ actual: 1200, promedio6m: 1000 })]} />)
    expect(screen.getByText('1.200')).not.toHaveClass('text-dsred')
})

it('no resalta cuando no hay promedio 6M de referencia (rubro sin historial)', () => {
    render(<VersusTable rubros={[rubro({ actual: 0, promedio6m: 0 })]} />)
    expect(screen.getAllByText('0')[0]).not.toHaveClass('text-dsred')
})
