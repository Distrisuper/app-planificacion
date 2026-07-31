import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolverLoteVista from './ResolverLoteVista'
import type { IMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
]

it('muestra cuántos rubros se van a resolver, en plural', () => {
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={3} value={[]} onChange={vi.fn()} onVolver={vi.fn()} />,
    )
    expect(screen.getByText('Resolver 3 rubros')).toBeInTheDocument()
})

it('en singular con un solo rubro', () => {
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={1} value={[]} onChange={vi.fn()} onVolver={vi.fn()} />,
    )
    expect(screen.getByText('Resolver 1 rubro')).toBeInTheDocument()
})

it('tildar un motivo dispara onChange con el borrador compartido', () => {
    const onChange = vi.fn()
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={2} value={[]} onChange={onChange} onVolver={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('Volver dispara onVolver', () => {
    const onVolver = vi.fn()
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={2} value={[]} onChange={vi.fn()} onVolver={onVolver} />,
    )
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})
