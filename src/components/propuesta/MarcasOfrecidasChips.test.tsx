import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import MarcasOfrecidasChips from './MarcasOfrecidasChips'

const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }
const corven = { code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22, dejo: true }
const catalogo = [{ code: 'B1', description: 'FREMAX' }, { code: 'B9', description: 'SKF' }]

function setup(over: Partial<React.ComponentProps<typeof MarcasOfrecidasChips>> = {}) {
    const onChange = vi.fn()
    render(
        <MarcasOfrecidasChips marcasDelRubro={[fremax, corven]} catalogo={catalogo} value={[]} onChange={onChange} {...over} />,
    )
    return { onChange }
}

it('muestra un chip por marca del rubro, sin sufijo "compra"/"dejó", y "+ Otra"', () => {
    setup()
    expect(screen.getByRole('button', { name: 'FREMAX' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CORVEN' })).toBeInTheDocument()
    expect(screen.queryByText(/dejó/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/compra/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /otra/i })).toBeInTheDocument()
    expect(screen.getByText(/qué marca ofreciste/i)).toBeInTheDocument()
    expect(screen.getByText(/opcional/i)).toBeInTheDocument()
})

it('tocar un chip lo agrega; tocarlo de nuevo lo saca', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /FREMAX/ }))
    expect(onChange).toHaveBeenCalledWith([{ codigo: 'B1', descripcion: 'FREMAX' }])
})

it('con la marca ya elegida, tocarla la quita', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    expect(screen.getByRole('button', { name: /FREMAX/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /FREMAX/ }))
    expect(onChange).toHaveBeenCalledWith([])
})

it('multi-selección: suma sin pisar', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    fireEvent.click(screen.getByRole('button', { name: /CORVEN/ }))
    expect(onChange).toHaveBeenCalledWith([
        { codigo: 'B1', descripcion: 'FREMAX' },
        { codigo: 'B2', descripcion: 'CORVEN' },
    ])
})

it('"+ Otra" abre el catálogo y la elegida se suma como chip; no duplica', () => {
    const { onChange } = setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }] })
    fireEvent.click(screen.getByRole('button', { name: /otra/i }))
    fireEvent.click(screen.getByText('SKF'))
    expect(onChange).toHaveBeenCalledWith([
        { codigo: 'B1', descripcion: 'FREMAX' },
        { codigo: 'B9', descripcion: 'SKF' },
    ])
})

it('una marca elegida que no está en el desglose se muestra igual como chip', () => {
    setup({ value: [{ codigo: 'B9', descripcion: 'SKF' }] })
    expect(screen.getByRole('button', { name: /SKF/ })).toHaveAttribute('aria-pressed', 'true')
})

it('sin marcas del rubro, sólo "+ Otra"', () => {
    setup({ marcasDelRubro: [] })
    expect(screen.queryByRole('button', { name: /FREMAX/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /otra/i })).toBeInTheDocument()
})

it('"Aplicar a restantes" sólo con algo tildado y restantes > 0, y dispara una vez', () => {
    const onAplicarATodos = vi.fn()
    setup({ value: [], rubrosRestantes: 2, onAplicarATodos })
    expect(screen.queryByText(/aplicar a restantes/i)).not.toBeInTheDocument()
})

it('"Aplicar a restantes" con marca tildada', () => {
    const onAplicarATodos = vi.fn()
    setup({ value: [{ codigo: 'B1', descripcion: 'FREMAX' }], rubrosRestantes: 2, onAplicarATodos })
    fireEvent.click(screen.getByLabelText(/aplicar a restantes/i))
    expect(onAplicarATodos).toHaveBeenCalledTimes(1)
})
