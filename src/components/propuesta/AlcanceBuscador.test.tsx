import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AlcanceBuscador from './AlcanceBuscador'

const marcas = [
    { code: 'SKF', description: 'SKF' },
    { code: 'AG', description: 'AG' },
]
const rubros = [{ code: 'BUJES', description: 'Bujes' }]

describe('AlcanceBuscador', () => {
    it('sin escribir nada, mezcla marcas y rubros en una sola lista', () => {
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={vi.fn()} />)

        expect(screen.getByRole('button', { name: /skf/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /ag/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
    })

    it('cada resultado muestra su tag de tipo', () => {
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={vi.fn()} />)

        const filaSkf = screen.getByRole('button', { name: /skf/i })
        const filaBujes = screen.getByRole('button', { name: /bujes/i })
        expect(filaSkf).toHaveTextContent('Marca')
        expect(filaBujes).toHaveTextContent('Rubro')
    })

    it('buscar filtra sobre los dos catálogos a la vez', () => {
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(/buscar marca o rubro/i), {
            target: { value: 'buj' },
        })

        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /skf/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /ag.*marca/i })).not.toBeInTheDocument()
    })

    it('tocar un resultado de marca dispara onSelect con tipo marca', () => {
        const onSelect = vi.fn()
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={onSelect} />)

        fireEvent.click(screen.getByRole('button', { name: /ag.*marca/i }))

        expect(onSelect).toHaveBeenCalledWith({ tipo: 'marca', codigo: 'AG', descripcion: 'AG' })
    })

    it('tocar un resultado de rubro dispara onSelect con tipo rubro', () => {
        const onSelect = vi.fn()
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={onSelect} />)

        fireEvent.click(screen.getByRole('button', { name: /bujes/i }))

        expect(onSelect).toHaveBeenCalledWith({ tipo: 'rubro', codigo: 'BUJES', descripcion: 'Bujes' })
    })

    it('mientras marcasLoading, muestra estado de carga en vez de la lista', () => {
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} marcasLoading onSelect={vi.fn()} />)

        expect(screen.getByText(/cargando/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /bujes/i })).not.toBeInTheDocument()
    })

    it('sin resultados, muestra el mensaje correspondiente', () => {
        render(<AlcanceBuscador marcas={marcas} rubros={rubros} onSelect={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(/buscar marca o rubro/i), {
            target: { value: 'zzz' },
        })

        expect(screen.getByText(/sin resultados/i)).toBeInTheDocument()
    })
})
