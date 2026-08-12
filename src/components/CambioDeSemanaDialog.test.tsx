import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CambioDeSemanaDialog from './CambioDeSemanaDialog'

describe('CambioDeSemanaDialog', () => {
    it('muestra la semana abierta y cuántos clientes le quedan pendientes', () => {
        render(
            <CambioDeSemanaDialog
                open
                semanaAbierta={3}
                clientesPendientes={['101', '102']}
                onConfirmar={vi.fn()}
                onCancelar={vi.fn()}
            />,
        )
        expect(screen.getByText(/semana 3/i)).toBeInTheDocument()
        expect(screen.getByText(/2 clientes/i)).toBeInTheDocument()
    })

    it('confirmar dispara onConfirmar', () => {
        const onConfirmar = vi.fn()
        render(
            <CambioDeSemanaDialog
                open
                semanaAbierta={3}
                clientesPendientes={[]}
                onConfirmar={onConfirmar}
                onCancelar={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: /cambiar de semana/i }))
        expect(onConfirmar).toHaveBeenCalled()
    })

    it('cerrado no renderiza nada', () => {
        render(
            <CambioDeSemanaDialog
                open={false}
                semanaAbierta={3}
                clientesPendientes={[]}
                onConfirmar={vi.fn()}
                onCancelar={vi.fn()}
            />,
        )
        expect(screen.queryByText(/semana 3/i)).not.toBeInTheDocument()
    })
})
