import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EstadoVisitaSheet from './EstadoVisitaSheet'

const PROPS_BASE = {
    open: true,
    nombreCliente: 'Cliente Test',
    diaActual: 'LUN' as const,
    estadoActual: 'pendiente' as const,
    semanaActual: 2,
    semanasDisponibles: [1, 2, 3, 4],
    onReagendar: vi.fn(),
    onElegirNoVisita: vi.fn(),
    onClose: vi.fn(),
}

describe('EstadoVisitaSheet', () => {
    it('elegir un día de la semana actual habilita confirmar y llama a onReagendar con la semana actual', () => {
        const onReagendar = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onReagendar={onReagendar} />)
        fireEvent.click(screen.getByRole('button', { name: /martes/i }))
        fireEvent.click(screen.getByRole('button', { name: /mover al martes/i }))
        expect(onReagendar).toHaveBeenCalledWith(2, 'MAR')
    })

    it('muestra las semanas de la rotación, incluida la actual', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        expect(screen.getByRole('button', { name: /^semana 1$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^semana 2$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^semana 3$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^semana 4$/i })).toBeInTheDocument()
    })

    it('no muestra la fila de semanas si solo hay una disponible', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} semanasDisponibles={[2]} />)
        expect(screen.queryByRole('button', { name: /^semana 2$/i })).not.toBeInTheDocument()
    })

    it('elegir otra semana y un día llama a onReagendar con ambos', () => {
        const onReagendar = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onReagendar={onReagendar} />)
        fireEvent.click(screen.getByRole('button', { name: /^semana 4$/i }))
        fireEvent.click(screen.getByRole('button', { name: /jueves/i }))
        fireEvent.click(screen.getByRole('button', { name: /mover a semana 4 · jueves/i }))
        expect(onReagendar).toHaveBeenCalledWith(4, 'JUE')
    })

    it('deshabilita confirmar si se elige la posición actual (misma semana y día)', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        fireEvent.click(screen.getByRole('button', { name: /lunes/i }))
        expect(screen.getByRole('button', { name: /ya está el lunes/i })).toBeDisabled()
    })

    it('no visité deshabilitado si ya está registrado', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} estadoActual="no_visita" />)
        expect(screen.getByRole('button', { name: /ya registrado/i })).toBeDisabled()
    })
})
