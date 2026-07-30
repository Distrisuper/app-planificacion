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
    const onGuardarTodo = vi.fn()
    render(
        <ResolucionWizardAcciones
            rubros={rubros}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            guardados={{ 7: [], 8: [] }}
            fallidos={{}}
            onIndexChange={onIndexChange}
            onGuardarTodo={onGuardarTodo}
            {...over}
        />,
    )
    return { onIndexChange, onGuardarTodo }
}

it('Atrás está deshabilitado en el primer rubro', () => {
    setup()
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
})

it('Siguiente está deshabilitado en el último rubro', () => {
    setup({ index: 1 })
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled()
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

it('sin cambios pendientes, Guardar todo está deshabilitado', () => {
    setup()
    expect(screen.getByRole('button', { name: /guardar todo/i })).toBeDisabled()
})

it('con un cambio pendiente, Guardar todo se habilita, muestra la cuenta y dispara onGuardarTodo', () => {
    const { onGuardarTodo } = setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    const boton = screen.getByRole('button', { name: /guardar todo \(1\)/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    expect(onGuardarTodo).toHaveBeenCalled()
})

it('con el detalle de Precio incompleto, avisa cuál falta y bloquea Guardar todo', () => {
    setup({
        borradores: { 7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    expect(screen.getByText(/completá el detalle de precio en amortiguadores/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar todo/i })).toBeDisabled()
})

it('con fallidos, el botón pasa a Reintentar y lista los rubros que fallaron', () => {
    setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        fallidos: { 7: 'Sin conexión.' },
    })
    expect(screen.getByRole('button', { name: /reintentar \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/no se pudo guardar.*amortiguadores/i)).toBeInTheDocument()
})

it('mientras guarda, el botón muestra el estado de carga', () => {
    setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        guardando: true,
    })
    expect(screen.getByText(/guardando/i)).toBeInTheDocument()
})
