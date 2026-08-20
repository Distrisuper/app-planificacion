import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaEfectividadOperativa from './TablaEfectividadOperativa'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

const props = {
    vendedores: MOCK_RESUMEN.vendedores,
    promedios: MOCK_RESUMEN.promedios,
    onElegirVendedor: vi.fn(),
}

it('muestra una fila por vendedor más la de promedios', () => {
    render(<TablaEfectividadOperativa {...props} />)
    const filas = screen.getAllByRole('row')
    // encabezado + promedios + vendedores
    expect(filas).toHaveLength(MOCK_RESUMEN.vendedores.length + 2)
})

it('muestra las tres columnas acordadas, nada de cobertura ni efectividad comercial', () => {
    render(<TablaEfectividadOperativa {...props} />)
    expect(screen.getByRole('columnheader', { name: /^Efectividad$/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Visitas \(mensual\)/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Horas \(mensual\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /cobertura/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /efectividad comercial/i })).not.toBeInTheDocument()
})

it('cada columna tiene un botón de ayuda con la explicación completa (la meta ya se ve arriba, en los KPIs)', async () => {
    render(<TablaEfectividadOperativa {...props} />)
    expect(screen.queryByText(/Meta:/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Qué significa Horas (mensual)' }))
    expect(screen.getByText(/Horas de esas mismas visitas válidas/)).toBeInTheDocument()
})

it('muestra s/d, nunca 0%, cuando el vendedor no tiene objetivo vigente', () => {
    render(<TablaEfectividadOperativa {...props} />)
    const fila = screen.getByRole('row', { name: /HERRERA NATALIA/ })
    expect(within(fila).getByText('s/d')).toBeInTheDocument()
})

it('clickear una fila de vendedor llama a onElegirVendedor con su código', async () => {
    const onElegirVendedor = vi.fn()
    render(<TablaEfectividadOperativa {...props} onElegirVendedor={onElegirVendedor} />)
    const primero = MOCK_RESUMEN.vendedores[0]
    await userEvent.click(screen.getByRole('row', { name: new RegExp(primero.nombreVendedor) }))
    expect(onElegirVendedor).toHaveBeenCalledWith(primero.codigoParticularVendedor)
})

it('clickear la fila de promedios no llama a onElegirVendedor', async () => {
    const onElegirVendedor = vi.fn()
    render(<TablaEfectividadOperativa {...props} onElegirVendedor={onElegirVendedor} />)
    await userEvent.click(screen.getByRole('row', { name: /PROMEDIOS/ }))
    expect(onElegirVendedor).not.toHaveBeenCalled()
})

it('cada fila tiene su propio botón de ayuda que justifica ESA efectividad, no la del equipo', async () => {
    render(<TablaEfectividadOperativa {...props} />)
    const v5 = MOCK_RESUMEN.vendedores.find(v => v.codigoParticularVendedor === 'V5')!

    await userEvent.click(
        screen.getByRole('button', { name: `Por qué ${v5.nombreVendedor} tiene esta efectividad` }),
    )
    expect(
        screen.getByText(new RegExp(`Efectividad — ${Math.round(v5.efectividadOperativa!)}%`)),
    ).toBeInTheDocument()
    expect(
        screen.getByText(`Clientes distintos: ${Math.round(v5.pctCumplimientoClientes!)}%`),
    ).toBeInTheDocument()
})

it('abrir el popover de una fila no dispara la navegación al vendedor', async () => {
    const onElegirVendedor = vi.fn()
    render(<TablaEfectividadOperativa {...props} onElegirVendedor={onElegirVendedor} />)
    const primero = MOCK_RESUMEN.vendedores[0]
    await userEvent.click(
        screen.getByRole('button', { name: `Por qué ${primero.nombreVendedor} tiene esta efectividad` }),
    )
    expect(onElegirVendedor).not.toHaveBeenCalled()
})
