import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TablaActividad from './TablaActividad'
import TablaVisitas from './TablaVisitas'
import type { IContactoLlamado, IContactoVisita } from '@/types/analitica'

const LLAMADO: IContactoLlamado = {
    canal: 'llamado',
    llamadoId: 9,
    tipo: 'atendido',
    estado: 'venta',
    fecha: '2026-08-03',
    fechaInicio: '2026-08-03T18:30:00Z',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    codigoParticularCliente: 'C2000',
    nombreCliente: 'KIOSCO SUR',
    codigoAutor: '9001',
    nombreAutor: 'GOMEZ LUCIA',
    motivos: ['Saqué pedido'],
    resultado: 'ganado',
}

const VISITA: IContactoVisita = {
    canal: 'visita',
    visitaId: 1,
    fecha: '2026-08-03',
    fechaInicio: '2026-08-03T12:15:00Z',
    fechaFin: '2026-08-03T12:55:00Z',
    duracionMin: 40,
    distanciaInicioMetros: 80,
    distanciaFinMetros: 60,
    codigoParticularCliente: 'C1000',
    nombreCliente: 'CALDERON ALEJANDRO PABLO',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    tipo: 'visita',
    motivos: [],
    resultado: null,
}

describe('TablaActividad con llamados', () => {
    it('un llamado se muestra como llamado con su desenlace, no como visita cerrada', () => {
        render(<TablaActividad filas={[LLAMADO, VISITA]} onElegirVisita={vi.fn()} />)
        expect(screen.getByTestId('estado-llamado-9')).toHaveTextContent('Llamado · Venta')
        expect(screen.getByTestId('estado-1')).toHaveTextContent('Cerrada')
    })

    it('dice quién llamó y no pinta distancia ni duración', () => {
        render(<TablaActividad filas={[LLAMADO]} onElegirVisita={vi.fn()} />)
        expect(screen.getByText(/GOMEZ LUCIA/)).toBeInTheDocument()
        const dist = screen.getByTestId('distancia-llamado-9')
        expect(dist).toHaveTextContent('—')
        expect(dist.className).not.toMatch(/red/)
    })

    it('la hora del llamado es la argentina', () => {
        render(<TablaActividad filas={[LLAMADO]} onElegirVisita={vi.fn()} />)
        expect(screen.getByText('15:30')).toBeInTheDocument()
    })

    it('click en un llamado avisa con su id por su propio callback', async () => {
        const onElegirVisita = vi.fn()
        const onElegirLlamado = vi.fn()
        render(
            <TablaActividad filas={[LLAMADO]} onElegirVisita={onElegirVisita} onElegirLlamado={onElegirLlamado} />,
        )
        await userEvent.click(screen.getByText('KIOSCO SUR'))
        expect(onElegirLlamado).toHaveBeenCalledWith(9)
        expect(onElegirVisita).not.toHaveBeenCalled()
    })

    it('un llamado no atendido muestra el motivo del llamado', () => {
        render(
            <TablaActividad
                filas={[{ ...LLAMADO, tipo: 'no_atendido', estado: 'volver_a_llamar', motivos: ['Volver a llamar'], resultado: null }]}
                onElegirVisita={vi.fn()}
            />,
        )
        expect(screen.getByTestId('estado-llamado-9')).toHaveTextContent('Llamado · Volver a llamar')
    })

    it('la columna "Quién" es el vendedor en la visita y el TV en el llamado', () => {
        render(<TablaActividad filas={[LLAMADO, VISITA]} onElegirVisita={vi.fn()} />)
        expect(screen.getByRole('columnheader', { name: 'Quién' })).toBeInTheDocument()
        expect(screen.queryByRole('columnheader', { name: 'Vendedor' })).not.toBeInTheDocument()
        expect(screen.getByTestId('quien-llamado-9')).toHaveTextContent('GOMEZ LUCIA')
        expect(screen.getByTestId('quien-llamado-9')).toHaveTextContent('cliente de ACOSTA MARIANO')
        expect(screen.getByTestId('quien-1')).toHaveTextContent('ACOSTA MARIANO')
    })

    it('sin nombre en pl_tv muestra el código del TV', () => {
        render(<TablaActividad filas={[{ ...LLAMADO, nombreAutor: null }]} onElegirVisita={vi.fn()} />)
        expect(screen.getByTestId('quien-llamado-9')).toHaveTextContent('9001')
    })

    it('con un rango de un solo día no repite la fecha en cada fila', () => {
        const { rerender } = render(<TablaActividad filas={[LLAMADO, VISITA]} onElegirVisita={vi.fn()} />)
        expect(screen.getAllByText('2026-08-03')).toHaveLength(2)
        rerender(<TablaActividad filas={[LLAMADO, VISITA]} onElegirVisita={vi.fn()} mostrarFecha={false} />)
        expect(screen.queryByText('2026-08-03')).not.toBeInTheDocument()
    })
})

describe('TablaVisitas con llamados', () => {
    it('marca el llamado y quién llamó, sin distancia', () => {
        render(<TablaVisitas visitas={[VISITA, LLAMADO]} onElegirVisita={vi.fn()} />)
        expect(screen.getByTestId('canal-llamado-9')).toHaveTextContent(/Llamado.*GOMEZ LUCIA/)
        expect(screen.getByTestId('resultado-llamado-9')).toHaveTextContent('Ganado')
    })

    it('click en un llamado avisa por su callback', async () => {
        const onElegirLlamado = vi.fn()
        render(<TablaVisitas visitas={[LLAMADO]} onElegirVisita={vi.fn()} onElegirLlamado={onElegirLlamado} />)
        await userEvent.click(screen.getByText('KIOSCO SUR'))
        expect(onElegirLlamado).toHaveBeenCalledWith(9)
    })
})
