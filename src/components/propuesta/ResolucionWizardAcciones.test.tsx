import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizardAcciones from './ResolucionWizardAcciones'
import type { IMotivo, IVisitaRubro } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

const rubros: IVisitaRubro[] = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [],
    },
]

function setup(over: Record<string, unknown> = {}) {
    const onIndexChange = vi.fn()
    const onFinalizar = vi.fn()
    render(
        <ResolucionWizardAcciones
            rubros={rubros}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            guardados={{ 7: [], 8: [] }}
            fallidos={{}}
            onIndexChange={onIndexChange}
            onFinalizar={onFinalizar}
            {...over}
        />,
    )
    return { onIndexChange, onFinalizar }
}

it('en un rubro que no es el último, muestra Siguiente en vez de Finalizar', () => {
    setup()
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finalizar/i })).not.toBeInTheDocument()
})

it('Atrás está deshabilitado en el primer rubro', () => {
    setup()
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
})

it('Siguiente avanza el índice', () => {
    const { onIndexChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
})

it('Atrás retrocede el índice', () => {
    const { onIndexChange } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(onIndexChange).toHaveBeenCalledWith(0)
})

it('en el último rubro, muestra Finalizar en vez de Siguiente, habilitado sin cambios pendientes', () => {
    setup({ index: 1 })
    expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeEnabled()
})

it('Finalizar dispara onFinalizar', () => {
    const { onFinalizar } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))
    expect(onFinalizar).toHaveBeenCalled()
})

it('con el detalle de Precio incompleto, avisa cuál falta y bloquea Finalizar', () => {
    setup({
        index: 1,
        borradores: { 7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    expect(screen.getByText(/completá el detalle de precio en amortiguadores/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeDisabled()
})

it('con fallidos, Finalizar pasa a Reintentar y lista los rubros que fallaron', () => {
    setup({
        index: 1,
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        fallidos: { 7: 'Sin conexión.' },
    })
    expect(screen.getByRole('button', { name: /reintentar \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/no se pudo guardar.*amortiguadores/i)).toBeInTheDocument()
})

it('mientras guarda, el botón muestra el estado de carga', () => {
    setup({ index: 1, guardando: true })
    expect(screen.getByText(/guardando/i)).toBeInTheDocument()
})
