import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import VinculoFlexxus from './VinculoFlexxus'
import type { IAltaRelevada } from '@/types/analitica'

const alta = (over: Partial<IAltaRelevada> = {}): IAltaRelevada => ({
    rotacionClienteId: 9, vendedor: { codigo: 'V 2', nombre: 'Gómez' }, estado: 'visitada', fechaVisita: '2026-09-21',
    detalle: { nombre: 'Piche' }, contacto: null, camposCargados: 1, camposTotal: 15, vinculo: null, ...over,
})

it('visitada sin vincular: pegar el código y Vincular llama al handler con el código recortado', async () => {
    const onVincular = vi.fn().mockResolvedValue(null)
    render(<VinculoFlexxus alta={alta()} onVincular={onVincular} />)
    expect(screen.getByRole('button', { name: /vincular/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/código de cliente en flexxus/i), { target: { value: ' 10034 ' } })
    fireEvent.click(screen.getByRole('button', { name: /vincular/i }))
    await waitFor(() => expect(onVincular).toHaveBeenCalledWith('10034'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('muestra el mensaje de la API debajo del input cuando falla', async () => {
    const onVincular = vi.fn().mockResolvedValue('El cliente 10034 todavía no está en el padrón.')
    render(<VinculoFlexxus alta={alta()} onVincular={onVincular} />)
    fireEvent.change(screen.getByLabelText(/código de cliente en flexxus/i), { target: { value: '10034' } })
    fireEvent.click(screen.getByRole('button', { name: /vincular/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/todavía no está en el padrón/i)
})

it('vinculada: muestra el código y quién, sin input', () => {
    render(
        <VinculoFlexxus
            alta={alta({ vinculo: { codigoParticularCliente: '10034', vinculadoPor: 'admin@x.com', vinculadoEn: '2026-09-23T14:00:00.000Z' } })}
            onVincular={vi.fn()}
        />,
    )
    expect(screen.getByText(/vinculada al cliente 10034/i)).toBeInTheDocument()
    expect(screen.getByText(/admin@x.com/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('no visitada: se vincula después de la visita, sin input', () => {
    render(<VinculoFlexxus alta={alta({ estado: 'pendiente' })} onVincular={vi.fn()} />)
    expect(screen.getByText(/se vincula después de la visita/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
