import { render, screen } from '@testing-library/react'
import ResolucionSheet from './ResolucionSheet'

it('muestra el aviso arriba de los motivos cuando se lo pasan', () => {
    render(
        <ResolucionSheet
            open
            motivos={[]}
            confirmLabel="Registrar"
            aviso="Cargaste 3 rubros."
            onConfirm={() => {}}
            onClose={() => {}}
        />,
    )
    expect(screen.getByText('Cargaste 3 rubros.')).toBeInTheDocument()
})

it('sin aviso no deja ningún hueco', () => {
    render(
        <ResolucionSheet
            open
            motivos={[]}
            confirmLabel="Registrar"
            onConfirm={() => {}}
            onClose={() => {}}
        />,
    )
    expect(screen.queryByTestId('resolucion-aviso')).not.toBeInTheDocument()
})
