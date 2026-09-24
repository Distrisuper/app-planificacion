import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import RankingVendedores from './RankingVendedores'
import { MOCK_RESUMEN_METRICAS } from '@/mocks/metricasMock'

const filas = () => screen.getAllByRole('row').slice(2) // 0 = header, 1 = total equipo

it('arranca con Total equipo arriba y un renglón por vendedor', () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Total equipo')
    expect(filas()).toHaveLength(3)
})

it('ordena por tasa de cierre de mejor a peor, con s/d al final, y el segundo toque invierte', async () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Tasa de cierre/ }))
    expect(filas().map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual([
        'FERNANDEZ MARCELO', 'GOMEZ SERGIO', 'MARTINEZ GUSTAVO',
    ])
    await userEvent.click(screen.getByRole('button', { name: /Tasa de cierre/ }))
    expect(within(filas()[0]).getAllByRole('cell')[0]).toHaveTextContent('GOMEZ SERGIO')
    expect(within(filas()[2]).getAllByRole('cell')[0]).toHaveTextContent('MARTINEZ GUSTAVO')
})

it('tocar una fila elige al vendedor', async () => {
    const onElegir = vi.fn()
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={onElegir} />)
    await userEvent.click(screen.getByText('GOMEZ SERGIO'))
    expect(onElegir).toHaveBeenCalledWith('V 5')
})

it('un vendedor sin visitas muestra s/d en tasa de cierre, no 0%', () => {
    render(<RankingVendedores resumen={MOCK_RESUMEN_METRICAS} proyectado={false} onElegir={vi.fn()} />)
    const martinez = screen.getByText('MARTINEZ GUSTAVO').closest('tr')!
    expect(martinez).toHaveTextContent('s/d')
})

it('dos vendedores sin dato empatan (comparador consistente) y quedan al final en su orden', async () => {
    const sinDato = (codigo: string, nombre: string) => ({
        ...MOCK_RESUMEN_METRICAS.vendedores[2], codigoVendedor: codigo, nombreVendedor: nombre,
    })
    const resumen = {
        ...MOCK_RESUMEN_METRICAS,
        vendedores: [sinDato('V 8', 'AAA SIN DATO'), MOCK_RESUMEN_METRICAS.vendedores[0], sinDato('V 9', 'BBB SIN DATO')],
    }
    render(<RankingVendedores resumen={resumen} proyectado={false} onElegir={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Tasa de cierre/ }))
    expect(filas().map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual([
        'FERNANDEZ MARCELO', 'AAA SIN DATO', 'BBB SIN DATO',
    ])
})
