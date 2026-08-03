import { render, screen } from '@testing-library/react'
import { fmtAmount } from './fmtAmount'

function renderValue(value: number) {
    render(<div data-testid="out">{fmtAmount(value)}</div>)
    return screen.getByTestId('out')
}

it('formatea en miles, con el $ como span aparte', () => {
    const el = renderValue(940_911)
    expect(el).toHaveTextContent('$ 941')
})

it('formatea millones en miles igual (sin sufijo M)', () => {
    const el = renderValue(11_858_000)
    expect(el).toHaveTextContent('$ 11.858')
})

it('devuelve – para 0', () => {
    const el = renderValue(0)
    expect(el).toHaveTextContent('–')
})

it('devuelve – para importes menores a 500 (redondean a 0 miles)', () => {
    const el = renderValue(300)
    expect(el).toHaveTextContent('–')
})

it('un negativo lleva el signo fuera del $, no dentro', () => {
    const el = renderValue(-940_911)
    expect(el.textContent).toBe('-$ 941')
})
