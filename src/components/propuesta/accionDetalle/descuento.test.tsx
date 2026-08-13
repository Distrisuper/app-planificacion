import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorDescuento, esValidoDescuento, resumenDescuento } from './descuento'

describe('esValidoDescuento', () => {
    it('undefined no es válido', () => {
        expect(esValidoDescuento(undefined)).toBe(false)
    })

    it('pct 0 no es válido', () => {
        expect(esValidoDescuento({ pct: 0 })).toBe(false)
    })

    it('pct negativo no es válido', () => {
        expect(esValidoDescuento({ pct: -5 })).toBe(false)
    })

    it('pct positivo es válido', () => {
        expect(esValidoDescuento({ pct: 5 })).toBe(true)
    })
})

describe('resumenDescuento', () => {
    it('formatea el porcentaje', () => {
        expect(resumenDescuento({ pct: 5 })).toBe('5% descuento')
    })
})

describe('EditorDescuento', () => {
    it('muestra el campo de porcentaje', () => {
        render(<EditorDescuento value={undefined} onChange={vi.fn()} />)
        expect(screen.getByLabelText(/% de descuento/i)).toBeInTheDocument()
    })

    it('cargar el porcentaje dispara onChange', () => {
        const onChange = vi.fn()
        render(<EditorDescuento value={undefined} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText(/% de descuento/i), { target: { value: '5' } })

        expect(onChange).toHaveBeenCalledWith({ pct: 5 })
    })
})
