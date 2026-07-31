import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SeleccionBar from './SeleccionBar'

it('muestra la cantidad seleccionada en singular', () => {
    render(<SeleccionBar cantidad={1} onCancelar={vi.fn()} onResolver={vi.fn()} />)
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument()
})

it('muestra la cantidad seleccionada en plural', () => {
    render(<SeleccionBar cantidad={3} onCancelar={vi.fn()} onResolver={vi.fn()} />)
    expect(screen.getByText('3 seleccionados')).toBeInTheDocument()
})

it('Cancelar dispara onCancelar', () => {
    const onCancelar = vi.fn()
    render(<SeleccionBar cantidad={2} onCancelar={onCancelar} onResolver={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onCancelar).toHaveBeenCalled()
})

it('Resolver seleccionados dispara onResolver', () => {
    const onResolver = vi.fn()
    render(<SeleccionBar cantidad={2} onCancelar={vi.fn()} onResolver={onResolver} />)
    fireEvent.click(screen.getByRole('button', { name: /resolver seleccionados/i }))
    expect(onResolver).toHaveBeenCalled()
})
