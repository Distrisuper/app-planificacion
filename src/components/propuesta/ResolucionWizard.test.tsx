import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
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
    const onCambiarBorrador = vi.fn()
    const onVolver = vi.fn()
    render(
        <ResolucionWizard
            rubros={rubros}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            onCambiarBorrador={onCambiarBorrador}
            onVolver={onVolver}
            {...over}
        />,
    )
    return { onCambiarBorrador, onVolver }
}

it('muestra la posición y el rubro actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('tildar un motivo avisa con el rubro actual', () => {
    const { onCambiarBorrador } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onCambiarBorrador).toHaveBeenCalledWith(7, [
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('Volver dispara onVolver', () => {
    const { onVolver } = setup()
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})
