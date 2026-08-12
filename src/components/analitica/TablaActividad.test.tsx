import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaActividad from './TablaActividad'
import type { IVisitaFila } from '@/types/analitica'

const base: IVisitaFila = {
    visitaId: 1,
    fecha: '2026-08-03',
    fechaInicio: '2026-08-03T12:15:00Z',
    fechaFin: '2026-08-03T12:55:00Z',
    duracionMin: 40,
    distanciaMetros: 80,
    codigoParticularCliente: 'C1000',
    nombreCliente: 'CALDERON ALEJANDRO PABLO',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    tipo: 'visita',
    motivos: ['Saqué pedido'],
    resultado: 'ganado',
}

it('muestra el vendedor de cada fila', () => {
    render(<TablaActividad filas={[base]} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('ACOSTA MARIANO')).toBeInTheDocument()
})

it('la HORA es la argentina, no la del ISO en UTC', () => {
    render(<TablaActividad filas={[base]} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('09:15')).toBeInTheDocument()
    expect(screen.queryByText('12:15')).not.toBeInTheDocument()
})

it('una visita abierta se muestra En curso, no s/d', () => {
    const enCurso: IVisitaFila = {
        ...base,
        visitaId: 2,
        fechaFin: null,
        duracionMin: null,
        motivos: [],
        resultado: null,
    }
    render(<TablaActividad filas={[enCurso]} onElegirVisita={vi.fn()} />)
    expect(screen.getByTestId('estado-2')).toHaveTextContent('En curso')
})

it('una no-visita muestra sus motivos', () => {
    const noVisita: IVisitaFila = {
        ...base,
        visitaId: 4,
        tipo: 'no_visita',
        fechaFin: null,
        duracionMin: null,
        distanciaMetros: null,
        motivos: ['Cerrado'],
        resultado: null,
    }
    render(<TablaActividad filas={[noVisita]} onElegirVisita={vi.fn()} />)
    expect(screen.getByTestId('estado-4')).toHaveTextContent('No visitó')
    expect(screen.getByText('Cerrado')).toBeInTheDocument()
})

it('sin coord del cliente la distancia va en s/d y en gris, no en rojo', () => {
    const sinCoord: IVisitaFila = { ...base, visitaId: 5, distanciaMetros: null }
    render(<TablaActividad filas={[sinCoord]} onElegirVisita={vi.fn()} />)
    const celda = screen.getByTestId('distancia-5')
    expect(celda).toHaveTextContent('s/d')
    expect(celda.className).toContain('text-slate-400')
    expect(celda.className).not.toContain('text-red')
})

it('click en una fila avisa con el id de la visita', async () => {
    const onElegir = vi.fn()
    render(<TablaActividad filas={[base]} onElegirVisita={onElegir} />)
    await userEvent.click(screen.getByText('CALDERON ALEJANDRO PABLO'))
    expect(onElegir).toHaveBeenCalledWith(1)
})
