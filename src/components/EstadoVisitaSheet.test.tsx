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
    onElegirDia: vi.fn(),
    onElegirSemana: vi.fn(),
    onElegirNoVisita: vi.fn(),
    onClose: vi.fn(),
}

describe('EstadoVisitaSheet', () => {
    it('elegir un día habilita confirmar y llama a onElegirDia', () => {
        const onElegirDia = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onElegirDia={onElegirDia} />)
        fireEvent.click(screen.getByRole('button', { name: /martes/i }))
        fireEvent.click(screen.getByRole('button', { name: /elegí una opción|confirmar/i }))
        expect(onElegirDia).toHaveBeenCalledWith('MAR')
    })

    it('muestra las otras semanas de la rotación, sin la actual', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        expect(screen.getByRole('button', { name: /semana 1/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /semana 3/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /semana 4/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /semana 2/i })).not.toBeInTheDocument()
    })

    it('elegir otra semana llama a onElegirSemana', () => {
        const onElegirSemana = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onElegirSemana={onElegirSemana} />)
        fireEvent.click(screen.getByRole('button', { name: /semana 4/i }))
        expect(onElegirSemana).toHaveBeenCalledWith(4)
    })

    it('no visité deshabilitado si ya está registrado', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} estadoActual="no_visita" />)
        expect(screen.getByRole('button', { name: /ya registrado/i })).toBeDisabled()
    })
})
