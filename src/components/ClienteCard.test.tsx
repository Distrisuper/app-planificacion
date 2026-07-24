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
    render(<ClienteCard cliente={{ ...cliente, resuelto: true }} onAbrir={vi.fn()} onReagendar={vi.fn()} />)
    expect(screen.getByText('Almacén Don José')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /propuesta/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reagendar/i })).not.toBeInTheDocument()
})

it('fires onAbrir when the Propuesta button is tapped', async () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente} onAbrir={onAbrir} onReagendar={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /propuesta/i }))
    expect(onAbrir).toHaveBeenCalledWith('10034')
})

it('fires onReagendar when the Reagendar button is tapped', async () => {
    const onReagendar = vi.fn()
    render(<ClienteCard cliente={cliente} onAbrir={vi.fn()} onReagendar={onReagendar} />)
    await userEvent.click(screen.getByRole('button', { name: /reagendar/i }))
    expect(onReagendar).toHaveBeenCalledWith('10034')
})
