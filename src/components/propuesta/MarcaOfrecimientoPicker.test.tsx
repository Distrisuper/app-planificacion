import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'

const marcas = [{ code: 'AG', description: 'AG' }]

describe('MarcaOfrecimientoPicker', () => {
    // El campo está siempre a la vista (como Acción comercial), con "Sin marca" de
    // arranque: plegado detrás de un "¿De qué marca?" nadie sabía que existía.
    it('sin marca elegida, muestra el campo con "Sin marca" y sin la lista abierta', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={vi.fn()} />)

        expect(screen.getByLabelText('Marca del ofrecimiento')).toHaveTextContent('Sin marca')
        expect(screen.queryByText('AG')).not.toBeInTheDocument()
    })

    // Un solo control: al abrir, el buscador REEMPLAZA al disparador en vez de sumarse
    // arriba — así el bloque no ocupa el doble de alto.
    it('abrir muestra el buscador en lugar del disparador, no además de él', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={vi.fn()} />)

        fireEvent.click(screen.getByLabelText('Marca del ofrecimiento'))

        expect(screen.getByText('AG')).toBeInTheDocument()
        expect(screen.queryByLabelText('Marca del ofrecimiento')).not.toBeInTheDocument()
    })

    it('elegir una marca la guarda por su descripción', () => {
        const onChange = vi.fn()
        render(<MarcaOfrecimientoPicker marcas={marcas} value={null} onChange={onChange} />)

        fireEvent.click(screen.getByLabelText('Marca del ofrecimiento'))
        fireEvent.click(screen.getByText('AG'))

        expect(onChange).toHaveBeenCalledWith('AG')
    })

    it('con marca ya elegida, la muestra en el disparador', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value="AG" onChange={vi.fn()} />)

        expect(screen.getByLabelText('Marca del ofrecimiento')).toHaveTextContent('AG')
    })

    it('el header deja explícito que es opcional', () => {
        render(<MarcaOfrecimientoPicker marcas={marcas} value="AG" onChange={vi.fn()} />)
        expect(screen.getByText('(opcional)')).toBeInTheDocument()
    })

    // Simétrico a "Sin acción" en AccionComercialPicker, pero como PRIMERA fila de la
    // lista y no como chip aparte arriba del buscador.
    it('ofrece "Sin marca" como primera opción de la lista', () => {
        const onChange = vi.fn()
        render(<MarcaOfrecimientoPicker marcas={marcas} value="AG" onChange={onChange} />)

        fireEvent.click(screen.getByLabelText('Marca del ofrecimiento'))
        fireEvent.click(screen.getByText('Sin marca'))

        expect(onChange).toHaveBeenCalledWith(null)
    })
})
