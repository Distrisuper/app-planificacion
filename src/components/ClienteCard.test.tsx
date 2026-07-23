// src/components/ClienteCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'

const cliente = {
    codigoParticularCliente: '10034',
    nombreCliente: 'Almacén Don José',
    barrio: 'Centro',
    diaVisita: 's1d1',
    descripcionSemana: 'ALMIRANTE BROWN',
}

it('shows resolved styling and hides the actions when resuelto', () => {
    render(<ClienteCard cliente={{ ...cliente, resuelto: true }} onAbrir={vi.fn()} />)
    expect(screen.getByText('Almacén Don José')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
})

it('fires onAbrir when tapped and not resolved', async () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente} onAbrir={onAbrir} />)
    await userEvent.click(screen.getByText('Almacén Don José'))
    expect(onAbrir).toHaveBeenCalledWith('10034')
})
