import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccionComercialPicker from './AccionComercialPicker'

const acciones = [
    { code: 'CUPO', description: 'Plan cupo' },
    { code: 'DESCUENTO', description: 'Descuento' },
]

describe('AccionComercialPicker', () => {
    it('sin acción elegida, solo muestra el disparador', () => {
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={vi.fn()} />)

        expect(screen.getByText(/con acción comercial/i)).toBeInTheDocument()
        expect(screen.queryByText('Plan cupo')).not.toBeInTheDocument()
    })

    it('abrir muestra las acciones del catálogo', () => {
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={vi.fn()} />)

        fireEvent.click(screen.getByText(/con acción comercial/i))

        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Descuento' })).toBeInTheDocument()
    })

    it('elegir una acción avisa sin params', () => {
        const onChange = vi.fn()
        render(<AccionComercialPicker acciones={acciones} value={null} onChange={onChange} />)

        fireEvent.click(screen.getByText(/con acción comercial/i))
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

    // Con acción ya elegida, las opciones se colapsan a un resumen de una línea: no
    // tiene sentido mostrar "Sin acción / Plan cupo / Descuento" lado a lado cuando ya
    // se decidió una — solo ocupa espacio.
    it('con una acción ya elegida, colapsa las opciones a un resumen', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO' }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.getByText('Descuento')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Plan cupo' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /sin acción/i })).not.toBeInTheDocument()
    })

    it('tocar el resumen vuelve a desplegar las opciones', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                value={{ accion: 'DESCUENTO' }}
                onChange={vi.fn()}
            />,
        )

        fireEvent.click(screen.getByText('Descuento'))

        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
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

        fireEvent.click(screen.getByText('Descuento'))
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

        fireEvent.click(screen.getByText('Descuento'))
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
