import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClienteCardRuta from './ClienteCardRuta'
import type { IAgendaClientAdmin } from '@/types/planificacion'

const CLIENTE = {
    rotacionClienteId: 11,
    codigoCliente: 'C001',
    codigoParticularCliente: 'P001',
    nombreCliente: 'KIOSCO DON JUAN',
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    rubrosPendientes: 0,
    ultimoMovimiento: null,
} as unknown as IAgendaClientAdmin

describe('ClienteCardRuta', () => {
    it('muestra el nombre en title case y el código particular', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.getByText('Kiosco Don Juan')).toBeInTheDocument()
        expect(screen.getByText('P001')).toBeInTheDocument()
    })

    it('sin movimientos no muestra autoría', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.queryByTitle(/movió/i)).not.toBeInTheDocument()
    })

    it('muestra quién movió la fila y cuándo, en hora de negocio', () => {
        render(
            <ClienteCardRuta
                cliente={{
                    ...CLIENTE,
                    ultimoMovimiento: {
                        origen: 'gerencia',
                        usuario: 'jefa@distrisuper.com',
                        fecha: '2026-08-11T14:05:00.000Z',
                    },
                }}
            />,
        )
        expect(
            screen.getByTitle('Movió gerencia (jefa@distrisuper.com) el 11/08 11:05'),
        ).toBeInTheDocument()
    })

    it('marca visualmente al cliente ya resuelto: no se puede mover', () => {
        render(<ClienteCardRuta cliente={{ ...CLIENTE, estado: 'visitada' }} />)
        expect(screen.getByTestId('card-cliente-11')).toHaveAttribute(
            'data-resuelto',
            'true',
        )
    })
})
