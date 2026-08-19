import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { EditorPlazo } from './plazo'
import { EditorFlete } from './flete'
import { EditorNoTrabaja } from './noTrabaja'

const props = { marcas: [], onChange: vi.fn() }

describe('Plazo', () => {
    it('guarda los días como número', () => {
        const onChange = vi.fn()
        render(<EditorPlazo {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/plazo solicitado/i), { target: { value: '30' } })
        expect(onChange).toHaveBeenCalledWith({ plazo_dias: 30 })
    })
})

describe('Flete', () => {
    it('guarda los dos montos como número', () => {
        const onChange = vi.fn()
        render(<EditorFlete {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/valor del flete/i), { target: { value: '60000' } })
        expect(onChange).toHaveBeenCalledWith({ valor_flete: 60000 })
    })

    it('muestra cuánto pesa el flete sobre la compra', () => {
        render(<EditorFlete {...props} valores={{ valor_flete: 60000, compra_futuro: 3000000 }} />)
        expect(screen.getByText(/el flete representa el 2\.0% de la compra/i)).toBeInTheDocument()
    })

    it('sin la compra cargada no muestra el porcentaje', () => {
        render(<EditorFlete {...props} valores={{ valor_flete: 60000 }} />)
        expect(screen.queryByText(/representa/i)).not.toBeInTheDocument()
    })

    it('el punto decimal no se trunca al tipear', () => {
        const onChange = vi.fn()
        render(<EditorFlete {...props} valores={{}} onChange={onChange} />)
        const input = screen.getByLabelText(/valor del flete/i) as HTMLInputElement
        fireEvent.change(input, { target: { value: '150.' } })
        expect(input.value).toBe('150.')
        fireEvent.change(input, { target: { value: '150.5' } })
        expect(input.value).toBe('150.5')
        expect(onChange).toHaveBeenCalledWith({ valor_flete: 150.5 })
    })

    it('una entrada rota nunca muestra el literal "NaN"', () => {
        render(<EditorFlete {...props} valores={{}} />)
        const input = screen.getByLabelText(/compra en \$ a futuro/i) as HTMLInputElement
        fireEvent.change(input, { target: { value: '1..2' } })
        expect(input.value).not.toBe('NaN')
    })
})

describe('No trabaja la marca', () => {
    it('guarda qué marca trabaja', () => {
        const onChange = vi.fn()
        render(<EditorNoTrabaja {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/qué marca trabaja/i), { target: { value: 'Corven' } })
        expect(onChange).toHaveBeenCalledWith({ marca_trabaja: 'Corven' })
    })

    it('el porqué es un textarea: es contexto para leer, no un dato corto', () => {
        render(<EditorNoTrabaja {...props} valores={{}} />)
        expect(screen.getByLabelText(/por qué/i).tagName).toBe('TEXTAREA')
    })
})
