import { render, screen } from '@testing-library/react'
import AppHeader from './AppHeader'

it('shows the visit progress out of the total', () => {
    render(<AppHeader vendedorNombre="Martín Rossi" completadas={3} total={40} rangoSemana="13 – 17 Jul" />)
    expect(screen.getByText('3 / 40')).toBeInTheDocument()
    expect(screen.getByText('Martín Rossi')).toBeInTheDocument()
})
