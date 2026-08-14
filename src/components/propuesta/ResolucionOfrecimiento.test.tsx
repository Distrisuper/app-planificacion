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
    expect(screen.getByLabelText('Marca del motivo')).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('la marca se elige del catálogo, no se escribe', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir una marca la guarda por su descripción', () => {
    const { onChange } = setup([
        { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
    ])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
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
    expect(screen.getByText(/acción comercial/i)).toBeInTheDocument()
})

it('ofrece cargar una acción comercial arriba del checklist', () => {
    const { onChangeAccion } = setup()
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
    fireEvent.click(screen.getByLabelText('Marca'))
    fireEvent.click(screen.getByText('Fric-Rot'))

    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

// La marca de la acción y la del chip Marca son EL MISMO dato — nunca se duplican.
it('con acción y marca ya cargadas, el chip Marca muestra esa misma marca', () => {
    setup([], { accion: { accion: 'CUPO', marca: 'Fric-Rot' } })

    expect(screen.getByLabelText('Marca')).toHaveTextContent('Fric-Rot')
})

it('sacar la acción con una marca ya cargada conserva la marca', () => {
    const { onChangeAccion } = setup([], { accion: { accion: 'CUPO', marca: 'Fric-Rot' } })
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

// Cada chip tiene SU propio check ("Aplicar a restantes"), compacto en su header —
// uno para acción, otro para marca. Nunca la resolución, que es de cada rubro.
describe('aplicar a restantes: un check por chip', () => {
    it('sin acción ni marca, no se ofrece ningún check aunque haya rubros restantes', () => {
        setup([], { rubrosRestantes: 3 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('sin rubros restantes, no se ofrece el check aunque haya acción cargada', () => {
        setup([], { accion: { accion: 'CUPO', marca: null }, rubrosRestantes: 0 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('con solo acción cargada, ofrece un único check (el de Acción)', () => {
        setup([], { accion: { accion: 'CUPO', marca: null }, rubrosRestantes: 4 })
        expect(screen.getAllByText('Aplicar a restantes')).toHaveLength(1)
    })

    it('con acción y marca cargadas, ofrece un check en cada chip', () => {
        setup([], { accion: { accion: 'CUPO', marca: 'AG' }, rubrosRestantes: 4 })
        expect(screen.getAllByText('Aplicar a restantes')).toHaveLength(2)
    })

    it('tildar el check de Acción dispara onAplicarAccion, no onAplicarMarca', () => {
        const onAplicarAccion = vi.fn()
        const onAplicarMarca = vi.fn()
        setup([], {
            accion: { accion: 'CUPO', marca: 'AG' },
            rubrosRestantes: 2,
            onAplicarAccion,
            onAplicarMarca,
        })

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        expect(onAplicarAccion).toHaveBeenCalledTimes(1)
        expect(onAplicarMarca).not.toHaveBeenCalled()
    })

    it('tildar el check de Marca dispara onAplicarMarca, no onAplicarAccion', () => {
        const onAplicarAccion = vi.fn()
        const onAplicarMarca = vi.fn()
        setup([], {
            accion: { accion: 'CUPO', marca: 'AG' },
            rubrosRestantes: 2,
            onAplicarAccion,
            onAplicarMarca,
        })

        fireEvent.click(screen.getAllByRole('checkbox')[1])

        expect(onAplicarMarca).toHaveBeenCalledTimes(1)
        expect(onAplicarAccion).not.toHaveBeenCalled()
    })

    it('con solo marca (sin acción) también se ofrece su check', () => {
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 1 })
        expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })
})
