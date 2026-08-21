import { render, screen } from '@testing-library/react'
import AgendaBoard from './AgendaBoard'
import type { Dia, IAgendaClient, SemanaAgenda } from '@/types/planificacion'

function cliente(over: Partial<IAgendaClient> = {}): IAgendaClient {
    return {
        codigoCliente: over.codigoParticularCliente ?? 'C',
        codigoParticularCliente: '1',
        nombreCliente: 'Cliente',
        rotacionClienteId: 1,
        dia: 1,
        estado: 'pendiente',
        visitaId: null,
        ofrecimientosPendientes: 0,
        seguimiento: { estado: 'no_corresponde', motivo: null, mensaje: null },
        esExtra: false,
        ...over,
    }
}

function semanaCon(lun: IAgendaClient[]): SemanaAgenda {
    const vacio: Record<Dia, IAgendaClient[]> = { LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] }
    return { ...vacio, LUN: lun }
}

const noop = () => {}

it('los clientes resueltos se listan al final, en su orden relativo original', () => {
    const clientes = [
        cliente({ codigoParticularCliente: '1', nombreCliente: 'Primero visitado', estado: 'visitada', visitaId: 7 }),
        cliente({ codigoParticularCliente: '2', nombreCliente: 'Pendiente A' }),
        cliente({ codigoParticularCliente: '3', nombreCliente: 'Ausente Total', estado: 'no_visita' }),
        cliente({ codigoParticularCliente: '4', nombreCliente: 'Pendiente B' }),
    ]
    render(
        <AgendaBoard
            semana={semanaCon(clientes)}
            activo="LUN"
            modo="operable"
            onActivoChange={noop}
            onAbrir={noop}
            onEstadoVisita={noop}
            onIniciarVisita={noop}
            onAbrirAppExterna={noop}
            onReintentarSeguimiento={noop}
        />,
    )

    const nombres = screen
        .getAllByText(/^(Pendiente A|Pendiente B|Primero Visitado|Ausente Total)$/)
        .map(el => el.textContent)
    expect(nombres).toEqual([
        'Pendiente A',
        'Pendiente B',
        'Primero Visitado',
        'Ausente Total',
    ])
})

it('en_curso no se considera resuelto: se queda arriba con los pendientes', () => {
    const clientes = [
        cliente({ codigoParticularCliente: '1', nombreCliente: 'Visitado Ya', estado: 'visitada', visitaId: 7 }),
        cliente({ codigoParticularCliente: '2', nombreCliente: 'Activo Ahora', estado: 'en_curso', visitaId: 8 }),
    ]
    render(
        <AgendaBoard
            semana={semanaCon(clientes)}
            activo="LUN"
            modo="operable"
            onActivoChange={noop}
            onAbrir={noop}
            onEstadoVisita={noop}
            onIniciarVisita={noop}
            onAbrirAppExterna={noop}
            onReintentarSeguimiento={noop}
        />,
    )

    const nombres = screen.getAllByText(/^(Visitado Ya|Activo Ahora)$/).map(el => el.textContent)
    expect(nombres).toEqual(['Activo Ahora', 'Visitado Ya'])
})
