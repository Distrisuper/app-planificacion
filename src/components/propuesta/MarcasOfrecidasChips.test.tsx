import { render, screen, fireEvent } from '@testing-library/react'
import { describe, vi } from 'vitest'
import MarcasOfrecidasChips from './MarcasOfrecidasChips'

const fremax = { code: 'B1', nombre: 'FREMAX', actual: 0, mesAnterior: 54, promedio6m: 61, dejo: false }
const corven = { code: 'B2', nombre: 'CORVEN', actual: 0, mesAnterior: 0, promedio6m: 22, dejo: true }
const catalogo = [{ code: 'B1', description: 'FREMAX' }, { code: 'B9', description: 'SKF' }]

function setup(over: Partial<React.ComponentProps<typeof MarcasOfrecidasChips>> = {}) {
    const onChange = vi.fn()
    render(
        <MarcasOfrecidasChips
            marcasDelRubro={[fremax, corven]}
            catalogo={catalogo}
            rubroCode="AMORT"
            value={[]}
            onChange={onChange}
            {...over}
        />,
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

// SKF es UNA marca con varias líneas (brand_code). El chip trae la línea que el cliente
// compra en el rubro y el catálogo otra: comparando por código, SKF tildada seguía en
// "+ Otra" y elegirla ahí sumaba un segundo chip "SKF".
describe('una marca con varias líneas', () => {
    const skfChip = { code: '132', nombre: 'SKF', actual: 0, mesAnterior: 5, promedio6m: 4, dejo: false }
    const skfCatalogo = [{ code: '096', description: 'SKF', lineaPorRubro: { '367': '096', '373': '097' } }]

    it('tildada como chip, no vuelve a aparecer en "+ Otra"', () => {
        setup({
            marcasDelRubro: [skfChip],
            catalogo: skfCatalogo,
            rubroCode: '367',
            value: [{ codigo: '132', descripcion: 'SKF' }],
        })
        fireEvent.click(screen.getByRole('button', { name: /otra/i }))
        expect(screen.getAllByText('SKF')).toHaveLength(1)
    })

    it('elegida en "+ Otra" con un chip del mismo nombre, tilda el chip con SU línea', () => {
        const { onChange } = setup({ marcasDelRubro: [skfChip], catalogo: skfCatalogo, rubroCode: '367' })
        fireEvent.click(screen.getByRole('button', { name: /otra/i }))
        fireEvent.click(screen.getAllByText('SKF').at(-1)!)
        expect(onChange).toHaveBeenCalledWith([{ codigo: '132', descripcion: 'SKF' }])
    })

    it('elegida en "+ Otra" sin chip, guarda la línea de la marca en ESTE rubro', () => {
        const { onChange } = setup({ marcasDelRubro: [], catalogo: skfCatalogo, rubroCode: '373' })
        fireEvent.click(screen.getByRole('button', { name: /otra/i }))
        fireEvent.click(screen.getByText('SKF'))
        expect(onChange).toHaveBeenCalledWith([{ codigo: '097', descripcion: 'SKF' }])
    })

    it('un alcance guardado con otra línea se lee como el mismo chip, no como uno extra', () => {
        setup({ marcasDelRubro: [skfChip], catalogo: skfCatalogo, value: [{ codigo: '096', descripcion: 'SKF' }] })
        const botones = screen.getAllByRole('button', { name: /SKF/ })
        expect(botones).toHaveLength(1)
        expect(botones[0]).toHaveAttribute('aria-pressed', 'true')
    })

    it('dos líneas de la misma marca en el desglose dibujan un solo chip', () => {
        setup({ marcasDelRubro: [skfChip, { ...skfChip, code: '096' }], catalogo: skfCatalogo })
        expect(screen.getAllByRole('button', { name: /SKF/ })).toHaveLength(1)
    })
})
