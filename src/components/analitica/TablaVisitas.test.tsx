import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaVisitas from './TablaVisitas'
import type { IVisitaFila } from '@/types/analitica'

const VISITAS: IVisitaFila[] = [
    {
        visitaId: 1,
        fecha: '2026-07-20',
        horaInicio: '09:13',
        horaFin: '09:58',
        duracionMin: 45,
        distanciaMetros: 29,
        codigoParticularCliente: 'C1',
        nombreCliente: 'OSANO ALDO MARIO',
        tipo: 'visita',
        motivos: ['Saqué pedido'],
        resultado: 'ganado',
    },
    {
        visitaId: 2,
        fecha: '2026-07-20',
        horaInicio: '11:44',
        horaFin: '12:27',
        duracionMin: 43,
        distanciaMetros: null,
        codigoParticularCliente: 'C2',
        nombreCliente: 'REPUESTOS DEL SUR',
        tipo: 'visita',
        motivos: ['Precio'],
        resultado: 'perdido',
    },
    {
        visitaId: 3,
        fecha: '2026-07-21',
        horaInicio: '10:02',
        horaFin: '10:20',
        duracionMin: 18,
        distanciaMetros: 4300,
        codigoParticularCliente: 'C3',
        nombreCliente: 'TABORA EMANUEL',
        tipo: 'visita',
        motivos: [],
        resultado: null,
    },
]

it('muestra una fila por visita', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getAllByRole('row')).toHaveLength(VISITAS.length + 1)
})

it('pinta en verde la distancia dentro de los 300 m', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('29 m')).toHaveClass('text-emerald-600')
})

it('pinta en rojo la distancia fuera de tolerancia', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    expect(screen.getByText('4300 m')).toHaveClass('text-red-600')
})

it('muestra s/d en gris cuando el cliente no tiene coords', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const celda = screen.getByText('s/d')
    expect(celda).toHaveClass('text-slate-400')
    expect(celda).not.toHaveClass('text-red-600')
})

it('muestra el motivo y el resultado cargados', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const fila = screen.getByRole('row', { name: /OSANO/ })
    expect(within(fila).getByText('Saqué pedido')).toBeInTheDocument()
    expect(within(fila).getByText('Ganado')).toBeInTheDocument()
})

it('deja vacías las columnas de una visita sin rubros resueltos', () => {
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={vi.fn()} />)
    const fila = screen.getByRole('row', { name: /TABORA/ })
    expect(within(fila).getByTestId('resultado-3')).toHaveTextContent('—')
})

it('avisa al padre la visita elegida', async () => {
    const onElegirVisita = vi.fn()
    render(<TablaVisitas visitas={VISITAS} onElegirVisita={onElegirVisita} />)
    await userEvent.click(screen.getByText('OSANO ALDO MARIO'))
    expect(onElegirVisita).toHaveBeenCalledWith(1)
})
