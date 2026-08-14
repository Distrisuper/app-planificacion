import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'

const marcas = [{ code: 'AG', description: 'AG' }]

describe('MarcaOfrecimientoPicker', () => {
    it('sin marca elegida, solo muestra el disparador', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={vi.fn()} />)

        expect(screen.getByText(/de qué marca/i)).toBeInTheDocument()
        expect(screen.queryByText('AG')).not.toBeInTheDocument()
    })

    // Un solo click: el buscador aparece de una, sin un segundo toque para desplegarlo.
    it('abrir muestra el buscador de marcas de una, sin un segundo click', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={vi.fn()} />)

        fireEvent.click(screen.getByText(/de qué marca/i))

        expect(screen.getByText('AG')).toBeInTheDocument()
    })

    it('elegir una marca la guarda por su descripción', () => {
        const onChange = vi.fn()
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={onChange} />)

        fireEvent.click(screen.getByText(/de qué marca/i))
        fireEvent.click(screen.getByText('AG'))

        expect(onChange).toHaveBeenCalledWith('AG')
    })

    it('con marca ya elegida, la muestra sin el disparador', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value="AG" onChange={vi.fn()} />)

        expect(screen.queryByText(/de qué marca/i)).not.toBeInTheDocument()
        expect(screen.getByText('AG')).toBeInTheDocument()
    })
})
