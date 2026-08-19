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

// Objeción y Cierre comparten el mismo espacio a ancho completo, alternados por un
// segmentado: en un teléfono, dos columnas de ~165px no dejan lugar a los paneles de
// detalle (marca/competidor/% de Precio, y los que vengan). Pendientes queda siempre
// visible abajo porque acompaña a una objeción.
describe('segmentado Objeción / Cierre', () => {
    const segmento = (nombre: string) => screen.getByRole('button', { name: new RegExp(nombre, 'i') })

    it('arranca en Objeción y no muestra los motivos de Cierre', () => {
        setup()
        expect(screen.getByText('Precio')).toBeInTheDocument()
        expect(screen.getByText('DS 100%')).toBeInTheDocument()
        expect(screen.queryByText('Dto')).not.toBeInTheDocument()
    })

    it('tocar Cierre muestra sus motivos y esconde los de Objeción', () => {
        setup()
        fireEvent.click(segmento('Cierre'))
        expect(screen.getByText('Dto')).toBeInTheDocument()
        expect(screen.queryByText('Precio')).not.toBeInTheDocument()
    })

    it('Pendientes queda visible en los dos segmentos', () => {
        setup()
        expect(screen.getByText('Cupo')).toBeInTheDocument()
        fireEvent.click(segmento('Cierre'))
        expect(screen.getByText('Cupo')).toBeInTheDocument()
    })

    // Cambiar de segmento es cambiar de VISTA, no resetear: si limpiara lo tildado, el
    // vendedor perdería la carga por tocar una pestaña.
    it('cambiar de segmento no borra lo tildado', () => {
        const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(segmento('Cierre'))
        expect(onChange).not.toHaveBeenCalled()
    })

    // Corolario de lo anterior: lo tildado del otro lado quedaría invisible. El contador
    // en el segmento es lo que evita que se pierda de vista.
    it('el segmento cuenta lo tildado del otro lado', () => {
        setup([
            { motivoId: 20, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 21, marca: null, competidor: null, pctDiferencia: null },
        ])
        fireEvent.click(segmento('Cierre'))
        expect(segmento('Objeción')).toHaveTextContent('2')
    })

    // Al retomar un borrador, abre donde está la carga en vez de obligar a buscarla.
    it('con un Cierre ya tildado, abre en Cierre', () => {
        setup([{ motivoId: 22, marca: null, competidor: null, pctDiferencia: null }])
        expect(screen.getByText('Dto')).toBeInTheDocument()
        expect(screen.queryByText('Precio')).not.toBeInTheDocument()
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

// Qué puede convivir con qué. Una objeción puede dejar algo pendiente ("no me compró
// por precio, pero le queda el cupo"), así que perdido + diferido conviven. Un cierre
// no: si cerró, no quedó nada pendiente ni objetado.
describe('qué resoluciones conviven', () => {
    const PRECIO = { motivoId: 20, marca: null, competidor: null, pctDiferencia: null }
    const DS100 = { motivoId: 21, marca: null, competidor: null, pctDiferencia: null }
    const DTO = { motivoId: 22, marca: null, competidor: null, pctDiferencia: null }
    const CUPO = { motivoId: 24, marca: null, competidor: null, pctDiferencia: null }

    it('dos motivos "perdido" conviven', () => {
        const { onChange } = setup([PRECIO])
        fireEvent.click(screen.getByText('DS 100%'))
        expect(onChange).toHaveBeenCalledWith([PRECIO, DS100])
    })

    it('una Objeción convive con un Pendiente', () => {
        const { onChange } = setup([PRECIO])
        fireEvent.click(screen.getByText('Cupo'))
        expect(onChange).toHaveBeenCalledWith([PRECIO, CUPO])
    })

    it('y al revés: tildar una Objeción no borra el Pendiente ya tildado', () => {
        const { onChange } = setup([CUPO])
        fireEvent.click(screen.getByText('Precio'))
        expect(onChange).toHaveBeenCalledWith([CUPO, PRECIO])
    })

    it('un Cierre borra la Objeción ya tildada', () => {
        const { onChange } = setup([PRECIO])
        fireEvent.click(screen.getByRole('button', { name: /cierre/i }))
        fireEvent.click(screen.getByText('Dto'))
        expect(onChange).toHaveBeenCalledWith([DTO])
    })

    // La regla que pidió el usuario: pendientes NO convive con cierre.
    it('un Cierre borra también el Pendiente ya tildado', () => {
        const { onChange } = setup([PRECIO, CUPO])
        fireEvent.click(screen.getByRole('button', { name: /cierre/i }))
        fireEvent.click(screen.getByText('Dto'))
        expect(onChange).toHaveBeenCalledWith([DTO])
    })

    it('y al revés: tildar un Pendiente borra el Cierre ya tildado', () => {
        const { onChange } = setup([DTO])
        fireEvent.click(screen.getByText('Cupo'))
        expect(onChange).toHaveBeenCalledWith([CUPO])
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
