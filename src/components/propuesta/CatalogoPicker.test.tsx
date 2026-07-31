import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem } from '@/types/planificacion'

const items: ICatalogoItem[] = [
    { code: 'BAT', description: 'BATERÍAS' },
    { code: 'AMORT', description: 'Amortiguadores' },
    { code: 'FILT', description: 'Filtros' },
]

function setup(over: Record<string, unknown> = {}) {
    const onSelect = vi.fn()
    render(
        <CatalogoPicker
            items={items}
            onSelect={onSelect}
            placeholder="Buscar rubro…"
            {...over}
        />,
    )
    return { onSelect }
}

it('filtra ignorando acentos y mayúsculas', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Buscar rubro…'), {
        target: { value: 'bateria' },
    })
    expect(screen.getByText('BATERÍAS')).toBeInTheDocument()
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
})

it('no ofrece los codes excluidos', () => {
    setup({ excluir: ['FILT'] })
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
})

it('corta en 50 resultados y avisa que hay más', () => {
    const muchos: ICatalogoItem[] = Array.from({ length: 60 }, (_, i) => ({
        code: `M${i}`,
        description: `Marca ${i}`,
    }))
    setup({ items: muchos })
    expect(screen.getByText('Marca 49')).toBeInTheDocument()
    expect(screen.queryByText('Marca 50')).not.toBeInTheDocument()
    expect(screen.getByText(/seguí escribiendo/i)).toBeInTheDocument()
})

it('onSelect devuelve el ítem completo, no solo el texto', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByText('Filtros'))
    expect(onSelect).toHaveBeenCalledWith({ code: 'FILT', description: 'Filtros' })
})

it('muestra un value que ya no está en el catálogo en vez de perderlo', () => {
    setup({ value: 'frikrot' })
    expect(screen.getByText('frikrot')).toBeInTheDocument()
})

it('con pendingCode deshabilita la lista y marca la fila en curso', () => {
    setup({ pendingCode: 'FILT' })
    expect(screen.getByRole('button', { name: 'Amortiguadores' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveAttribute('aria-busy', 'true')
})

it('avisa cuando la búsqueda no encuentra nada', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Buscar rubro…'), {
        target: { value: 'zzz' },
    })
    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument()
})
