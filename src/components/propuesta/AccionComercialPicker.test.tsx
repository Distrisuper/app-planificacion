import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccionComercialPicker from './AccionComercialPicker'

const acciones = [
    { code: 'CUPO', description: 'Plan cupo' },
    { code: 'DESCUENTO', description: 'Descuento' },
]
const marcas = [{ code: 'AG', description: 'AG' }]

describe('AccionComercialPicker', () => {
    it('sin acción elegida, solo muestra el disparador', () => {
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={vi.fn()} />,
        )

        expect(screen.getByText(/con acción comercial/i)).toBeInTheDocument()
        expect(screen.queryByText('Plan cupo')).not.toBeInTheDocument()
    })

    it('abrir muestra las acciones del catálogo', () => {
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={vi.fn()} />,
        )

        fireEvent.click(screen.getByText(/con acción comercial/i))

        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Descuento' })).toBeInTheDocument()
    })

    it('elegir una acción avisa con marca en null y sin params', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={onChange} />,
        )

        fireEvent.click(screen.getByText(/con acción comercial/i))
        fireEvent.click(screen.getByRole('button', { name: 'Descuento' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'DESCUENTO', marca: null })
    })

    it('con una acción con módulo registrado, muestra su editor de params', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.getByLabelText(/% de descuento/i)).toBeInTheDocument()
    })

    it('cargar los params avisa con la acción completa', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.change(screen.getByLabelText(/% de descuento/i), { target: { value: '5' } })

        expect(onChange).toHaveBeenCalledWith({
            accion: 'DESCUENTO',
            marca: null,
            params: { pct: 5 },
        })
    })

    it('elegir una marca la guarda por su descripción', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByLabelText(/marca/i))
        fireEvent.click(screen.getByText('AG'))

        expect(onChange).toHaveBeenCalledWith({ accion: 'DESCUENTO', marca: 'AG' })
    })

    // Los params de Cupo (tramos) no significan nada para Descuento (%).
    it('cambiar de acción descarta los params de la anterior', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: 'AG', params: { pct: 5 } }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'CUPO', marca: 'AG' })
    })

    it('sacar la acción avisa con null', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /sin acción/i }))

        expect(onChange).toHaveBeenCalledWith(null)
    })

    it('una acción sin módulo registrado no muestra editor de params', () => {
        render(
            <AccionComercialPicker
                acciones={[{ code: 'PROMO', description: 'Promoción' }]}
                marcas={marcas}
                value={{ accion: 'PROMO', marca: null }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.queryByLabelText(/% de descuento/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/tramo 1/i)).not.toBeInTheDocument()
    })
})
