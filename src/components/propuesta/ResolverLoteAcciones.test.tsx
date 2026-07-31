import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolverLoteAcciones from './ResolverLoteAcciones'
import type { IMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

it('sin motivos tildados, Aplicar queda deshabilitado', () => {
    render(<ResolverLoteAcciones motivos={motivos} value={[]} cantidad={3} onCancelar={vi.fn()} onAplicar={vi.fn()} />)
    expect(screen.getByRole('button', { name: /aplicar a 3 rubros/i })).toBeDisabled()
})

it('con un motivo simple tildado, Aplicar se habilita', () => {
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={3}
            onCancelar={vi.fn()}
            onAplicar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /aplicar a 3 rubros/i })).toBeEnabled()
})

it('con Precio tildado sin detalle, Aplicar queda deshabilitado y avisa', () => {
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={2}
            onCancelar={vi.fn()}
            onAplicar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /aplicar a 2 rubros/i })).toBeDisabled()
    expect(screen.getByText(/completá el detalle de precio/i)).toBeInTheDocument()
})

it('Aplicar dispara onAplicar', () => {
    const onAplicar = vi.fn()
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={1}
            onCancelar={vi.fn()}
            onAplicar={onAplicar}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 1 rubro/i }))
    expect(onAplicar).toHaveBeenCalled()
})

it('Cancelar dispara onCancelar', () => {
    const onCancelar = vi.fn()
    render(<ResolverLoteAcciones motivos={motivos} value={[]} cantidad={1} onCancelar={onCancelar} onAplicar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onCancelar).toHaveBeenCalled()
})
