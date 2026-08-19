import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import type { ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

// Nombres alineados al catálogo real (Objeción/Cierre/Pendientes) — el componente no
// hardcodea ninguno, así que estos IDs y descripciones son arbitrarios a propósito.
const motivos: IMotivo[] = [
    { motivoId: 20, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 21, nivel: 'ofrecimiento', descripcion: 'DS 100%', resultado: 'perdido', requiereDetalle: false },
    { motivoId: 22, nivel: 'ofrecimiento', descripcion: 'Dto', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 23, nivel: 'ofrecimiento', descripcion: 'Plazo', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 24, nivel: 'ofrecimiento', descripcion: 'Cupo', resultado: 'diferido', requiereDetalle: false },
]

const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]

function setup(value: IOfrecimientoMotivo[] = [], over: Record<string, unknown> = {}) {
    const onChange = vi.fn()
    const onChangeAccion = vi.fn()
    render(
        <ResolucionOfrecimiento
            motivos={motivos}
            marcas={marcas}
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
    expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(screen.getByText('Cupo')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('no muestra el bloque de Acción Comercial', () => {
    setup()
    expect(screen.queryByText(/acción comercial/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sin acción/i })).not.toBeInTheDocument()
})

it('Marca aparece antes que Resolución', () => {
    setup()
    const marca = screen.getByLabelText('Marca')
    const objecion = screen.getByText('Objeción')
    // compareDocumentPosition: Node.DOCUMENT_POSITION_FOLLOWING (4) = marca va antes.
    expect(marca.compareDocumentPosition(objecion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText('Marca del motivo')).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('la marca del motivo se elige del catálogo, no se escribe', () => {
    setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir una marca la guarda por su descripción', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})

it('competidor sigue siendo texto libre', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: null, competidor: 'Corven', pctDiferencia: null },
    ])
})

it('ofrece cargar una marca', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

// Agrupación: cada motivo aparece bajo el título de bloque que le corresponde según
// `resultado`, sin que el componente conozca los nombres de los motivos.
describe('agrupación en 3 bloques', () => {
    it('perdido cae bajo Objeción', () => {
        setup()
        const bloque = screen.getByText('Objeción').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Precio')
        expect(bloque).toHaveTextContent('DS 100%')
    })

    it('ganado cae bajo Cierre', () => {
        setup()
        const bloque = screen.getByText('Cierre').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Dto')
        expect(bloque).toHaveTextContent('Plazo')
    })

    it('diferido cae bajo Pendientes', () => {
        setup()
        const bloque = screen.getByText('Pendientes').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Cupo')
    })

    it('un motivo sin bucket reconocido (no_ofrecido o null) cae en Otros, sin perderse', () => {
        setup([], {
            motivos: [
                ...motivos,
                { motivoId: 30, nivel: 'ofrecimiento', descripcion: 'Fuera de catálogo', resultado: 'no_ofrecido', requiereDetalle: false },
            ],
        })
        expect(screen.getByText('Otros')).toBeInTheDocument()
        expect(screen.getByText('Fuera de catálogo')).toBeInTheDocument()
    })

    it('sin motivos de un bucket, no muestra su título', () => {
        setup([], { motivos: motivos.filter(m => m.resultado !== 'diferido') })
        expect(screen.queryByText('Pendientes')).not.toBeInTheDocument()
    })
})

// El color no depende del nombre del motivo, sino de `resultado`.
describe('color por resultado', () => {
    it('un motivo sin tildar no tiene color propio', () => {
        setup()
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#E4E8F0', background: '#fff' })
    })

    it('ganado se tilda en verde', () => {
        setup([{ motivoId: 22, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Dto').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#9BE3B4', background: '#EAFBF1' })
    })

    it('diferido se tilda en amarillo', () => {
        setup([{ motivoId: 24, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Cupo').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F7DD8F', background: '#FEF9E8' })
    })

    it('perdido se tilda en naranja', () => {
        setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F3C8A0', background: '#FDF2E9' })
    })
})

// Varios motivos del mismo bucket conviven; uno de otro bucket reemplaza.
describe('un solo bucket de resultado a la vez', () => {
    it('dos motivos "perdido" conviven', () => {
        const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('DS 100%'))
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 20, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 21, marca: null, competidor: null, pctDiferencia: null },
        ])
    })

    it('tildar un motivo "ganado" reemplaza uno "perdido" ya tildado', () => {
        const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('Dto'))
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 22, marca: null, competidor: null, pctDiferencia: null },
        ])
    })
})

// El check "Aplicar a restantes" de Marca sigue siendo el único que ofrece este
// componente ahora que Acción Comercial no está.
describe('aplicar a restantes: check de Marca', () => {
    it('sin marca, no se ofrece el check aunque haya rubros restantes', () => {
        setup([], { rubrosRestantes: 3 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('sin rubros restantes, no se ofrece el check aunque haya marca cargada', () => {
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 0 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('con marca y rubros restantes, ofrece el check y dispara onAplicarMarca', () => {
        const onAplicarMarca = vi.fn()
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 2, onAplicarMarca })
        fireEvent.click(screen.getByRole('checkbox'))
        expect(onAplicarMarca).toHaveBeenCalledTimes(1)
    })
})
