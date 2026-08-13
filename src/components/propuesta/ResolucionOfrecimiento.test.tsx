import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import type { ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'ofrecimiento', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]

const acciones: ICatalogoItem[] = [{ code: 'CUPO', description: 'Plan cupo' }]

function setup(value: IOfrecimientoMotivo[] = [], over: Record<string, unknown> = {}) {
    const onChange = vi.fn()
    const onChangeAccion = vi.fn()
    render(
        <ResolucionOfrecimiento
            motivos={motivos}
            marcas={marcas}
            acciones={acciones}
            accion={null}
            onChangeAccion={onChangeAccion}
            value={value}
            onChange={onChange}
            {...over}
        />,
    )
    return { onChange, onChangeAccion }
}

it('renderiza el catálogo recibido, sin nombres hardcodeados', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText('No lo ofrecí')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('la marca se elige del catálogo, no se escribe', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText(/marca/i))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir una marca la guarda por su descripción', () => {
    const { onChange } = setup([
        { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
    ])
    fireEvent.click(screen.getByLabelText(/marca/i))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})

// Es una marca de afuera: no está en fct_sales, así que no hay catálogo que ofrecer.
it('competidor sigue siendo texto libre', () => {
    const { onChange } = setup([
        { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
    ])
    fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: null, competidor: 'Corven', pctDiferencia: null },
    ])
})

// El caso simple no cambió: sin acción, la pantalla es la de siempre.
it('sin acción comercial, el checklist es el de motivos de ofrecimiento', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText(/con acción comercial/i)).toBeInTheDocument()
})

it('ofrece cargar una acción comercial arriba del checklist', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByText(/con acción comercial/i))
    fireEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
    expect(onChangeAccion).toHaveBeenCalledWith({ accion: 'CUPO', marca: null })
})

// El checklist NO cambia con la acción: es siempre el catálogo de nivel
// 'ofrecimiento', que el backend completa con los motivos que faltaban.
it('con acción comercial cargada, el checklist sigue siendo el mismo', () => {
    setup([], { accion: { accion: 'CUPO', marca: null } })

    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText('No lo ofrecí')).toBeInTheDocument()
})
