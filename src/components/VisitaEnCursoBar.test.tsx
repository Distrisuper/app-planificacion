import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import VisitaEnCursoBar from './VisitaEnCursoBar'
import { marcarInicioVisita } from '@/lib/visitaTimer'

beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
})

it('muestra el nombre del cliente y dispara onExpandir al tocarla', async () => {
    marcarInicioVisita(1)
    const onExpandir = vi.fn()
    render(<VisitaEnCursoBar visitaId={1} nombreCliente="Kiosco Sur" onExpandir={onExpandir} />)

    expect(screen.getByText(/visitando a kiosco sur/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(onExpandir).toHaveBeenCalled()
})

it('sin inicio registrado, arranca el cronómetro en 00:00', () => {
    render(<VisitaEnCursoBar visitaId={99} nombreCliente="Kiosco Sur" onExpandir={() => {}} />)
    expect(screen.getByText('00:00')).toBeInTheDocument()
})

it('actualiza el cronómetro cada segundo', () => {
    vi.useFakeTimers()
    marcarInicioVisita(1)

    render(<VisitaEnCursoBar visitaId={1} nombreCliente="Kiosco Sur" onExpandir={() => {}} />)
    expect(screen.getByText('00:00')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByText('00:03')).toBeInTheDocument()

    vi.useRealTimers()
})

it('alejado: muestra el aviso en vez del nombre, en rojo, y el cronómetro se sigue viendo', () => {
    marcarInicioVisita(1)
    render(
        <VisitaEnCursoBar
            visitaId={1}
            nombreCliente="Kiosco Sur"
            alejado
            onExpandir={() => {}}
        />,
    )

    expect(
        screen.getByText('Te alejaste de Kiosco Sur y la visita sigue abierta'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/visitando a kiosco sur/i)).not.toBeInTheDocument()
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveClass('bg-dsred')
})

it('sin alejado, se ve el naranja de siempre', () => {
    render(<VisitaEnCursoBar visitaId={1} nombreCliente="Kiosco Sur" onExpandir={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('bg-dsorange')
})
