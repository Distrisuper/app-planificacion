import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizardAcciones from './ResolucionWizardAcciones'
import type { IMotivo, IOfrecimiento } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

const ofrecimientos: IOfrecimiento[] = [
    {
        id: 7, resolucionId: 42, tipo: 'rubro', codigo: 'AMORT', descripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [], alcance: [],
    },
    {
        id: 8, resolucionId: 42, tipo: 'rubro', codigo: 'FILT', descripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
    },
]

function setup(over: Record<string, unknown> = {}) {
    const onIndexChange = vi.fn()
    const onFinalizar = vi.fn()
    render(
        <ResolucionWizardAcciones
            ofrecimientos={ofrecimientos}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            onIndexChange={onIndexChange}
            onFinalizar={onFinalizar}
            {...over}
        />,
    )
    return { onIndexChange, onFinalizar }
}

it('en un ofrecimiento que no es el último, muestra Siguiente en vez de Finalizar', () => {
    setup()
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finalizar/i })).not.toBeInTheDocument()
})

it('Atrás está deshabilitado en el primer ofrecimiento', () => {
    setup()
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
})

it('Siguiente avanza el índice', () => {
    const { onIndexChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
})

it('minimizar sale del wizard sin tocar el índice', () => {
    const { onFinalizar, onIndexChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /minimizar/i }))
    expect(onFinalizar).toHaveBeenCalled()
    expect(onIndexChange).not.toHaveBeenCalled()
})

it('en el último rubro no hay botón de minimizar: Finalizar ya es la salida', () => {
    setup({ index: 1 })
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minimizar/i })).not.toBeInTheDocument()
})

it('minimizar sigue habilitado con un detalle a medias, aunque Finalizar se bloquee', () => {
    // Precio (requiereDetalle) tildado sin detalle: es lo que bloquea Finalizar.
    const { onFinalizar } = setup({
        borradores: { 7: [{ motivoId: 13, detalle: null }], 8: [] },
    })
    fireEvent.click(screen.getByRole('button', { name: /minimizar/i }))
    expect(onFinalizar).toHaveBeenCalled()
})

it('Atrás retrocede el índice', () => {
    const { onIndexChange } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(onIndexChange).toHaveBeenCalledWith(0)
})

it('en el último ofrecimiento, muestra Finalizar en vez de Siguiente, habilitado sin nada bloqueante', () => {
    setup({ index: 1 })
    expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeEnabled()
})

it('Finalizar dispara onFinalizar', () => {
    const { onFinalizar } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))
    expect(onFinalizar).toHaveBeenCalled()
})

it('con el detalle de Precio incompleto en cualquier ofrecimiento, avisa cuál falta y bloquea Finalizar', () => {
    setup({
        index: 1,
        borradores: { 7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    expect(screen.getByText(/completá el detalle de precio en amortiguadores/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeDisabled()
})
