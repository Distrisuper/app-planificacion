import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AlcancePicker from './AlcancePicker'

const marcas = [
    { code: 'SKF', description: 'SKF' },
    { code: 'CORVEN', description: 'Corven' },
]
const rubros = [{ code: 'RODAM', description: 'Rodamientos' }]

describe('AlcancePicker', () => {
    it('arranca colapsado y dice que la oferta es global', () => {
        render(<AlcancePicker value={[]} onChange={vi.fn()} marcas={marcas} rubros={rubros} />)

        expect(screen.getByText('Todo el cliente')).toBeInTheDocument()
    })

    it('al expandir muestra el buscador de marcas', async () => {
        render(<AlcancePicker value={[]} onChange={vi.fn()} marcas={marcas} rubros={rubros} />)

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))

        expect(screen.getByPlaceholderText('Buscar marca…')).toBeInTheDocument()
    })

    it('elegir una marca la agrega al alcance', async () => {
        const onChange = vi.fn()
        render(<AlcancePicker value={[]} onChange={onChange} marcas={marcas} rubros={rubros} />)

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        expect(onChange).toHaveBeenCalledWith([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
        ])
    })

    // Multi-selección: el caso real es "descuento en SKF, sobre estos rubros".
    it('elegir una segunda marca no reemplaza a la primera', async () => {
        const onChange = vi.fn()
        const yaElegido = [{ tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' }]
        render(
            <AlcancePicker value={yaElegido} onChange={onChange} marcas={marcas} rubros={rubros} />,
        )

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Corven' }))

        expect(onChange).toHaveBeenCalledWith([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
            { tipo: 'marca', codigo: 'CORVEN', descripcion: 'Corven' },
        ])
    })

    it('volver a tocar un destino elegido lo saca', async () => {
        const onChange = vi.fn()
        const yaElegido = [{ tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' }]
        render(
            <AlcancePicker value={yaElegido} onChange={onChange} marcas={marcas} rubros={rubros} />,
        )

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        expect(onChange).toHaveBeenCalledWith([])
    })

    it('muestra el resumen de lo elegido', () => {
        const yaElegido = [
            { tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' },
            { tipo: 'rubro' as const, codigo: 'RODAM', descripcion: 'Rodamientos' },
        ]
        render(
            <AlcancePicker value={yaElegido} onChange={vi.fn()} marcas={marcas} rubros={rubros} />,
        )

        expect(screen.getByText('SKF · Rodamientos')).toBeInTheDocument()
    })
})
