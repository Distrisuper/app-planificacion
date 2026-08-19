import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { EditorPrecio } from './precio'
import type { ICatalogoItem } from '@/types/planificacion'

const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]

function setup(valores: Record<string, string | number | null> = {}) {
    const onChange = vi.fn()
    render(<EditorPrecio valores={valores} onChange={onChange} marcas={marcas} />)
    return { onChange }
}

it('la marca se elige del catálogo, no se escribe', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir la marca la guarda por su descripción', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith({ marca: 'Fric-Rot' })
})

// Es una marca de afuera: no está en fct_sales, así que no hay catálogo que ofrecer.
it('el competidor es texto libre', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText(/nombre del competidor/i), {
        target: { value: 'Corven' },
    })
    expect(onChange).toHaveBeenCalledWith({ competidor: 'Corven' })
})

it('los precios se guardan como número', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText(/precio del competidor/i), { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith({ precio_competidor: 150 })
})

describe('el % contra el competidor', () => {
    it('no se muestra hasta tener los dos precios', () => {
        setup({ precio_competidor: 150 })
        expect(screen.queryByText(/más barato|más caro/i)).not.toBeInTheDocument()
    })

    it('más barato se anuncia como tal', () => {
        setup({ precio_competidor: 150, mi_precio: 130 })
        expect(screen.getByText(/-13\.3% más barato que el competidor/i)).toBeInTheDocument()
    })

    it('más caro también, para que el vendedor lo vea antes de ofrecer', () => {
        setup({ precio_competidor: 130, mi_precio: 150 })
        expect(screen.getByText(/15\.4% más caro que el competidor/i)).toBeInTheDocument()
    })

    // Dividir por cero no puede pintar NaN en pantalla.
    it('con el precio del competidor en cero no muestra nada', () => {
        setup({ precio_competidor: 0, mi_precio: 150 })
        expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })
})
