import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'
import type { IAgendaClient } from '@/types/planificacion'

function cliente(over: Partial<IAgendaClient> = {}): IAgendaClient {
    return {
        codigoCliente: 'C1',
        codigoParticularCliente: '10034',
        nombreCliente: 'ALMACEN DON JOSE',
        direccion: 'Av. San Martín 100',
        cicloClienteId: 42,
        dia: 1,
        estado: 'pendiente',
        visitaId: null,
        rubrosPendientes: 0,
        ...over,
    }
}

const noop = () => {}
const handlers = {
    onAbrir: noop,
    onReagendar: noop,
    onNoVisita: noop,
    onCargarRubros: noop,
}

it('un cliente pendiente muestra las tres acciones', () => {
    render(<ClienteCard cliente={cliente()} {...handlers} />)
    expect(screen.getByRole('button', { name: /propuesta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no visité/i })).toBeInTheDocument()
})

it('en_curso muestra el badge y sigue permitiendo abrir la visita', () => {
    render(<ClienteCard cliente={cliente({ estado: 'en_curso', visitaId: 7 })} {...handlers} />)
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
})

it('un cliente resuelto no ofrece acciones de resolución', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.queryByRole('button', { name: /no visité/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reagendar/i })).not.toBeInTheDocument()
})

it('no_visita y reagendada se distinguen visualmente', () => {
    const { rerender } = render(<ClienteCard cliente={cliente({ estado: 'no_visita' })} {...handlers} />)
    expect(screen.getByText(/no visitado/i)).toBeInTheDocument()
    rerender(<ClienteCard cliente={cliente({ estado: 'reagendada' })} {...handlers} />)
    expect(screen.getByText(/reagendada/i)).toBeInTheDocument()
})

it('una visita con rubros sin cargar lo avisa y ofrece completarla', () => {
    const onCargarRubros = vi.fn()
    render(
        <ClienteCard
            cliente={cliente({ estado: 'visitada', visitaId: 7, rubrosPendientes: 2 })}
            {...handlers}
            onCargarRubros={onCargarRubros}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /2 rubros sin cargar/i }))
    expect(onCargarRubros).toHaveBeenCalledWith(expect.objectContaining({ visitaId: 7 }))
})

it('en modo preview no hay ninguna acción', () => {
    // La compuerta real la da el tipo (IPreviewClient no llega acá), pero la card
    // igual tiene que renderizarse sin botones cuando se hojea otra semana.
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('los handlers reciben el cliente completo, no el código', () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /propuesta/i }))
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})
