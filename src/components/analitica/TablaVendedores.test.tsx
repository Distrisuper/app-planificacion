import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaVendedores from './TablaVendedores'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

const props = {
    vendedores: MOCK_RESUMEN.vendedores,
    promedios: MOCK_RESUMEN.promedios,
    onElegirVendedor: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

it('muestra una fila por vendedor más la de promedios', () => {
    render(<TablaVendedores {...props} />)
    const filas = screen.getAllByRole('row')
    // encabezado + promedios + vendedores
    expect(filas).toHaveLength(MOCK_RESUMEN.vendedores.length + 2)
})

it('la fila de promedios se muestra primero', () => {
    render(<TablaVendedores {...props} />)
    const filas = screen.getAllByRole('row')
    expect(within(filas[1]).getByText('PROMEDIOS')).toBeInTheDocument()
})

it('marca el ciclo en curso para no leer mal una cobertura parcial', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /DOMINGUEZ SILVINA/ })
    expect(within(fila).getByTitle(/ciclo en curso/i)).toBeInTheDocument()
})

it('muestra s/d y no 0% cuando no hubo rubros ofrecidos', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /GIMENEZ ROBERTO/ })
    expect(within(fila).getAllByText('s/d').length).toBeGreaterThan(0)
})

it('pinta en rojo la duración bajo el piso de 20 minutos', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /FERREYRA GUSTAVO/ })
    expect(within(fila).getByText('14 min')).toHaveClass('text-red-600')
})

it('pinta en rojo al vendedor con la mitad de las visitas sin validar', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /ESQUIVEL RAMON/ })
    expect(within(fila).getByTestId('celda-no-validadas')).toHaveClass('text-red-600')
})

it('pinta en rojo la cobertura de un vendedor por debajo del 70% del promedio del equipo', () => {
    render(<TablaVendedores {...props} />)
    const fila = screen.getByRole('row', { name: /DOMINGUEZ SILVINA/ })
    expect(within(fila).getByText('40%')).toHaveClass('text-red-600')
})

it('ordena por cobertura al hacer click en el encabezado', async () => {
    render(<TablaVendedores {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /cobertura/i }))
    const filas = screen.getAllByRole('row')
    // filas[0] encabezado, filas[1] promedios: el primer vendedor es el de menor cobertura
    expect(within(filas[2]).getByText('DOMINGUEZ SILVINA')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cobertura/i }))
    const filasDesc = screen.getAllByRole('row')
    expect(within(filasDesc[2]).getByText('ACOSTA MARIANO')).toBeInTheDocument()
})

it('avisa al padre el vendedor elegido', async () => {
    render(<TablaVendedores {...props} />)
    await userEvent.click(screen.getByText('ACOSTA MARIANO'))
    expect(props.onElegirVendedor).toHaveBeenCalledWith('V1')
})

it('muestra la columna En curso con el valor del vendedor', () => {
    const vendedores = [
        { ...MOCK_RESUMEN.vendedores[0], codigoParticularVendedor: 'V4', enCurso: 2 },
    ]
    render(
        <TablaVendedores
            vendedores={vendedores}
            promedios={MOCK_RESUMEN.promedios}
            onElegirVendedor={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /en curso/i })).toBeInTheDocument()
    expect(screen.getByTestId('celda-enCurso-V4')).toHaveTextContent('2')
})
