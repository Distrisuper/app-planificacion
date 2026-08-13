import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EstadoVisitaSheet from './EstadoVisitaSheet'

const PROPS_BASE = {
    open: true,
    nombreCliente: 'Cliente Test',
    diaActual: 'LUN' as const,
    estadoActual: 'pendiente' as const,
    semanaActual: 2,
    // La 1 y la 3 sin nombrar (fallback a "Semana N"), la 2 y la 4 con zona: cubre los
    // dos casos del chip (con descripción y sin ella) en un solo fixture.
    semanasDisponibles: [
        { semana: 1, descripcion: null },
        { semana: 2, descripcion: 'Buenos Aires' },
        { semana: 3, descripcion: null },
        { semana: 4, descripcion: 'Zárate' },
    ],
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

    it('el botón de confirmar vive fuera del scroll: no se pierde con la lista larga de días', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        const boton = screen.getByRole('button', { name: /elegí un día/i })
        expect(boton.closest('.overflow-y-auto')).toBeNull()
    })

    it('las zonas sin nombrar muestran "Semana N"; las nombradas, la descripción arriba y "Semana N" chico abajo', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} />)
        // Sin descripción: "Semana N" es el único texto — no se duplica.
        expect(screen.getByRole('button', { name: /^semana 1$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^semana 3$/i })).toBeInTheDocument()
        // Con descripción: el nombre es el texto principal, "Semana N" queda de apoyo.
        expect(screen.getByRole('button', { name: /buenos aires.*semana 2/is })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /zárate.*semana 4/is })).toBeInTheDocument()
    })

    it('no muestra la fila de zonas si solo hay una disponible', () => {
        render(<EstadoVisitaSheet {...PROPS_BASE} semanasDisponibles={[{ semana: 2, descripcion: 'Buenos Aires' }]} />)
        expect(screen.queryByRole('button', { name: /buenos aires/i })).not.toBeInTheDocument()
    })

    it('elegir otra zona (con nombre) y un día llama a onReagendar con la semana, y el botón usa el nombre de la zona', () => {
        const onReagendar = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onReagendar={onReagendar} />)
        fireEvent.click(screen.getByRole('button', { name: /zárate.*semana 4/is }))
        fireEvent.click(screen.getByRole('button', { name: /jueves/i }))
        fireEvent.click(screen.getByRole('button', { name: /mover a zárate · jueves/i }))
        expect(onReagendar).toHaveBeenCalledWith(4, 'JUE')
    })

    it('elegir una zona sin nombrar arma el botón con "Semana N", no con un nombre inventado', () => {
        const onReagendar = vi.fn()
        render(<EstadoVisitaSheet {...PROPS_BASE} onReagendar={onReagendar} />)
        fireEvent.click(screen.getByRole('button', { name: /^semana 3$/i }))
        fireEvent.click(screen.getByRole('button', { name: /jueves/i }))
        fireEvent.click(screen.getByRole('button', { name: /mover a semana 3 · jueves/i }))
        expect(onReagendar).toHaveBeenCalledWith(3, 'JUE')
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
