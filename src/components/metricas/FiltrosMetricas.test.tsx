import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FiltrosMetricas from './FiltrosMetricas'
import { MOCK_OPCIONES } from '@/mocks/metricasMock'

const VENDEDORES = [{ codigo: 'V 2', nombre: 'FERNANDEZ' }]

it('cambiar un filtro geográfico resetea el vendedor', async () => {
    const onCambiar = vi.fn()
    render(<FiltrosMetricas valor={{ vendedor: 'V 2' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    await userEvent.selectOptions(screen.getByLabelText('Sucursal'), 'MDP')
    expect(onCambiar).toHaveBeenCalledWith({ sucursal: 'MDP', vendedor: undefined })
})

it('cambiar la zona limpia la localidad y la lista de localidades se acota a la zona', async () => {
    const onCambiar = vi.fn()
    const { rerender } = render(
        <FiltrosMetricas valor={{ localidad: 'Rosario' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Zona'), '01')
    expect(onCambiar).toHaveBeenCalledWith({ zona: '01', localidad: undefined, vendedor: undefined })

    rerender(<FiltrosMetricas valor={{ zona: '01' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    const localidades = screen.getByLabelText('Localidad')
    expect(localidades).toHaveTextContent('Miramar')
    expect(localidades).not.toHaveTextContent('Rosario')
})

it('elegir vendedor no toca los filtros geográficos', async () => {
    const onCambiar = vi.fn()
    render(<FiltrosMetricas valor={{ zona: '01' }} onCambiar={onCambiar} vendedores={VENDEDORES} opciones={MOCK_OPCIONES} />)
    await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')
    expect(onCambiar).toHaveBeenCalledWith({ zona: '01', vendedor: 'V 2' })
})
