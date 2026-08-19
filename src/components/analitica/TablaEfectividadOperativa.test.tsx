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
    expect(screen.getByRole('columnheader', { name: 'Efectividad operativa' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Visitas (mensual)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Horas (mensual)' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /cobertura/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /efectividad comercial/i })).not.toBeInTheDocument()
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
