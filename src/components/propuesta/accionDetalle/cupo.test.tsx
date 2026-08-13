import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorCupo, esValidoCupo, resumenCupo } from './cupo'

describe('esValidoCupo', () => {
    it('undefined no es válido', () => {
        expect(esValidoCupo(undefined)).toBe(false)
    })

    it('sin tramos no es válido', () => {
        expect(esValidoCupo({ tramos: [] })).toBe(false)
    })

    it('un tramo sin umbral no es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 0, descuentoPct: 5 }] })).toBe(false)
    })

    it('un tramo sin descuento no es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] })).toBe(false)
    })

    it('un tramo completo es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })).toBe(true)
    })

    it('si un tramo de varios está incompleto, no es válido', () => {
        expect(
            esValidoCupo({
                tramos: [
                    { umbral: 2_500_000, descuentoPct: 3 },
                    { umbral: 0, descuentoPct: 5 },
                ],
            }),
        ).toBe(false)
    })
})

describe('resumenCupo', () => {
    it('un tramo', () => {
        expect(resumenCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })).toBe(
            '$2.500.000→3%',
        )
    })

    it('dos tramos, separados por ·', () => {
        expect(
            resumenCupo({
                tramos: [
                    { umbral: 2_500_000, descuentoPct: 3 },
                    { umbral: 3_200_000, descuentoPct: 5 },
                ],
            }),
        ).toBe('$2.500.000→3% · $3.200.000→5%')
    })
})

describe('EditorCupo', () => {
    it('arranca con un tramo vacío y sin botón de quitar', () => {
        render(<EditorCupo value={undefined} onChange={vi.fn()} />)
        expect(screen.getByLabelText(/tramo 1.*alcanza/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /quitar tramo/i })).not.toBeInTheDocument()
    })

    it('cargar el umbral dispara onChange con el tramo actualizado', () => {
        const onChange = vi.fn()
        render(<EditorCupo value={undefined} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText(/tramo 1.*alcanza/i), {
            target: { value: '2500000' },
        })

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] })
    })

    it('cargar el descuento dispara onChange con el tramo actualizado', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] }}
                onChange={onChange}
            />,
        )

        fireEvent.change(screen.getByLabelText(/tramo 1.*descuento/i), { target: { value: '3' } })

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })
    })

    it('agregar tramo suma una fila nueva vacía', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }))

        expect(onChange).toHaveBeenCalledWith({
            tramos: [
                { umbral: 2_500_000, descuentoPct: 3 },
                { umbral: 0, descuentoPct: 0 },
            ],
        })
    })

    it('con más de un tramo, cada uno ofrece quitar', () => {
        render(
            <EditorCupo
                value={{
                    tramos: [
                        { umbral: 2_500_000, descuentoPct: 3 },
                        { umbral: 3_200_000, descuentoPct: 5 },
                    ],
                }}
                onChange={vi.fn()}
            />,
        )
        expect(screen.getByRole('button', { name: 'Quitar tramo 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Quitar tramo 2' })).toBeInTheDocument()
    })

    it('quitar un tramo lo saca de la lista', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{
                    tramos: [
                        { umbral: 2_500_000, descuentoPct: 3 },
                        { umbral: 3_200_000, descuentoPct: 5 },
                    ],
                }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Quitar tramo 1' }))

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 3_200_000, descuentoPct: 5 }] })
    })
})
