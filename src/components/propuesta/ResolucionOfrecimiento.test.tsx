import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import type { ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 11, nivel: 'ofrecimiento', descripcion: 'Pasa pedido mañana', resultado: 'diferido', requiereDetalle: false },
    { motivoId: 13, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 15, nivel: 'ofrecimiento', descripcion: 'DS', resultado: 'perdido', requiereDetalle: false },
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

// La marca es un chip aparte, independiente de si hay acción: se puede cargar sola.
it('ofrece cargar una marca sin acción comercial', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByText(/de qué marca/i))
    fireEvent.click(screen.getByLabelText(/marca/i))
    fireEvent.click(screen.getByText('Fric-Rot'))

    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

// La marca de la acción y la del chip Marca son EL MISMO dato — nunca se duplican.
it('con acción y marca ya cargadas, el chip Marca muestra esa misma marca', () => {
    setup([], { accion: { accion: 'CUPO', marca: 'Fric-Rot' } })

    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
    expect(screen.queryByText(/de qué marca/i)).not.toBeInTheDocument()
})

it('sacar la acción con una marca ya cargada conserva la marca', () => {
    const { onChangeAccion } = setup([], { accion: { accion: 'CUPO', marca: 'Fric-Rot' } })
    fireEvent.click(screen.getByText('Plan cupo'))
    fireEvent.click(screen.getByRole('button', { name: /sin acción/i }))

    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

// El color no depende del nombre del motivo, sino de `resultado` — así un motivo
// nuevo con `resultado: 'ganado'` sale verde sin tocar este componente.
describe('color por resultado', () => {
    it('un motivo sin tildar no tiene color propio', () => {
        setup()
        const boton = screen.getByText('Saqué pedido').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#E4E8F0', background: '#fff' })
    })

    it('ganado se tilda en verde', () => {
        setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Saqué pedido').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#9BE3B4', background: '#EAFBF1' })
    })

    it('diferido se tilda en amarillo', () => {
        setup([{ motivoId: 11, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Pasa pedido mañana').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F7DD8F', background: '#FEF9E8' })
    })

    it('perdido se tilda en naranja', () => {
        setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F3C8A0', background: '#FDF2E9' })
    })

    it('no_ofrecido se tilda en rojo', () => {
        setup([{ motivoId: 16, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('No lo ofrecí').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F1B3AC', background: '#FDECEB' })
    })
})

// Varios motivos del mismo bucket conviven (dos razones de una misma pérdida); un
// motivo de OTRO bucket reemplaza, nunca convive con uno contradictorio.
describe('un solo bucket de resultado a la vez', () => {
    it('dos motivos "perdido" conviven', () => {
        const { onChange } = setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('DS'))

        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 15, marca: null, competidor: null, pctDiferencia: null },
        ])
    })

    it('tildar un motivo "ganado" reemplaza uno "perdido" ya tildado', () => {
        const { onChange } = setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('Saqué pedido'))

        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
        ])
    })

    it('destildar sigue funcionando igual, sin importar el bucket de los demás', () => {
        const { onChange } = setup([
            { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 15, marca: null, competidor: null, pctDiferencia: null },
        ])
        fireEvent.click(screen.getByText('DS'))

        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
        ])
    })
})

// El check replica acción+marca a los rubros restantes — nunca la resolución, que es
// de cada rubro.
describe('aplicar acción y marca a los rubros restantes', () => {
    it('sin acción ni marca, no se ofrece el check aunque haya rubros restantes', () => {
        setup([], { rubrosRestantes: 3 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('sin rubros restantes, no se ofrece el check aunque haya acción cargada', () => {
        setup([], { accion: { accion: 'CUPO', marca: null }, rubrosRestantes: 0 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('con acción y rubros restantes, ofrece el check con la cantidad', () => {
        setup([], { accion: { accion: 'CUPO', marca: null }, rubrosRestantes: 4 })
        expect(screen.getByText('Aplicar esta acción y marca a los 4 rubros restantes')).toBeInTheDocument()
    })

    it('tildarlo dispara onAplicarATodos', () => {
        const onAplicarATodos = vi.fn()
        setup([], { accion: { accion: 'CUPO', marca: null }, rubrosRestantes: 2, onAplicarATodos })

        fireEvent.click(screen.getByRole('checkbox'))

        expect(onAplicarATodos).toHaveBeenCalledTimes(1)
    })

    it('con solo marca (sin acción) también se ofrece el check', () => {
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 1 })
        expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })
})
