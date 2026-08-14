import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccionComercialPicker from './AccionComercialPicker'

const acciones = [
    { code: 'CUPO', description: 'Plan cupo' },
    { code: 'DESCUENTO', description: 'Descuento' },
]

describe('AccionComercialPicker', () => {
    // Plegado detrás de un "¿Con acción comercial?" el vendedor no veía que las
    // opciones existían: ahora arranca desplegado, con "Sin acción" como default.
    it('sin acción elegida, arranca desplegado con las opciones a la vista', () => {
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: /sin acción/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
    })

    it('el header deja explícito que es opcional', () => {
        render(<AccionComercialPicker acciones={acciones} value={{ accion: 'CUPO' }} onChange={vi.fn()} />)
        expect(screen.getByText('(opcional)')).toBeInTheDocument()
    })

    it('muestra las acciones del catálogo', () => {
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Descuento' })).toBeInTheDocument()
    })

    it('elegir una acción avisa sin params', () => {
        const onChange = vi.fn()
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={onChange} />)

        fireEvent.click(screen.getByRole('button', { name: 'Descuento' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'DESCUENTO' })
    })

    it('con una acción con módulo registrado, muestra su editor de params', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO' }}
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
                value={{ accion: 'DESCUENTO' }}
                onChange={onChange}
            />,
        )

        fireEvent.change(screen.getByLabelText(/% de descuento/i), { target: { value: '5' } })

        expect(onChange).toHaveBeenCalledWith({
            accion: 'DESCUENTO',
            params: { pct: 5 },
        })
    })

    // Los chips no se colapsan al elegir: cambiar de acción tiene que costar un toque,
    // y desde un resumen de una línea no se ve qué otras opciones había.
    it('con una acción ya elegida, los chips siguen a la vista', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO' }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.getByRole('button', { name: 'Descuento' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /sin acción/i })).toBeInTheDocument()
    })

    // Los params de Cupo (tramos) no significan nada para Descuento (%).
    it('cambiar de acción descarta los params de la anterior', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO', params: { pct: 5 } }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'CUPO' })
    })

    it('sacar la acción avisa con null', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO' }}
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
                value={{ accion: 'PROMO' }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.queryByLabelText(/% de descuento/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/tramo 1/i)).not.toBeInTheDocument()
    })
})
