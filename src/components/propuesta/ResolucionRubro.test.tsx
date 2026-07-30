import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionRubro from './ResolucionRubro'
import type { IMotivo, IRubroMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

function setup(value: IRubroMotivo[] = []) {
    const onChange = vi.fn()
    render(<ResolucionRubro motivos={motivos} value={value} onChange={onChange} />)
    return { onChange }
}

it('renderiza el catálogo recibido, sin nombres hardcodeados', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText('No lo ofrecí')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('el detalle se edita por motivo', () => {
    const { onChange } = setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'Fric-Rot' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})
