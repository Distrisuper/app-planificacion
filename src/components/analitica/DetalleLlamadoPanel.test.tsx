import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import DetalleLlamadoPanel from './DetalleLlamadoPanel'
import * as api from '@/api/analitica'
import type { ILlamadoDetalle } from '@/types/analitica'

vi.mock('@/api/analitica')

const DETALLE: ILlamadoDetalle = {
    llamadoId: 9,
    fecha: '2026-08-03',
    fechaInicio: '2026-08-03T18:30:00Z',
    tipo: 'atendido',
    estado: 'venta',
    codigoParticularVendedor: 'V1',
    nombreVendedor: 'ACOSTA MARIANO',
    codigoParticularCliente: 'C2000',
    nombreCliente: 'KIOSCO SUR',
    codigoAutor: '9001',
    nombreAutor: 'GOMEZ LUCIA',
    motivos: [],
    ofrecimientos: [
        {
            codigo: '12',
            descripcion: 'Filtros',
            motivos: [{ descripcion: 'Saqué pedido', resultado: 'ganado', valores: { monto: 1200 } }],
            marcas: ['FRAS-LE'],
        },
    ],
    observaciones: 'Pide la lista nueva',
    proximoContacto: null,
}

function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <DetalleLlamadoPanel llamadoId={9} onCerrar={vi.fn()} />
        </QueryClientProvider>,
    )
}

it('muestra quién llamó, a qué hora argentina, el desenlace, los rubros y las observaciones, sin mapa', async () => {
    ;(api.getLlamadoDetalle as any).mockResolvedValue(DETALLE)
    montar()
    await waitFor(() => expect(screen.getByText('KIOSCO SUR')).toBeInTheDocument())
    expect(api.getLlamadoDetalle).toHaveBeenCalledWith(9)
    expect(screen.getByText('GOMEZ LUCIA')).toBeInTheDocument()
    expect(screen.getByText('15:30')).toBeInTheDocument()
    expect(screen.getByText('Venta')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
    expect(screen.getByText(/Saqué pedido · Ganado · monto: 1200/)).toBeInTheDocument()
    expect(screen.getByText(/FRAS-LE/)).toBeInTheDocument()
    expect(screen.getByText('Pide la lista nueva')).toBeInTheDocument()
    expect(screen.queryByText(/coordenadas/i)).not.toBeInTheDocument()
})

it('un no atendido muestra los motivos del llamado', async () => {
    ;(api.getLlamadoDetalle as any).mockResolvedValue({
        ...DETALLE,
        tipo: 'no_atendido',
        estado: 'no_atendio',
        motivos: ['No atiende'],
        ofrecimientos: [],
        observaciones: null,
    })
    montar()
    await waitFor(() => expect(screen.getByText('No atiende')).toBeInTheDocument())
    expect(screen.getByText('No atendió')).toBeInTheDocument()
})
