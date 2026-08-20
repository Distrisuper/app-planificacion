import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import type { ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

// Nombres alineados al catálogo real (Objeción/Cierre/Pendientes) — el componente no
// hardcodea ninguno, así que estos IDs y descripciones son arbitrarios a propósito.
const motivos: IMotivo[] = [
    {
        motivoId: 20,
        nivel: 'ofrecimiento',
        descripcion: 'Precio',
        resultado: 'perdido',
        codigo: 'PRECIO',
        campos: [
            { campo: 'marca', tipo: 'catalogo_marca', label: 'Marca', placeholder: null, unidad: null, requerido: true, orden: 10 },
            { campo: 'competidor', tipo: 'texto', label: 'Competidor', placeholder: 'Ej. Corven', unidad: null, requerido: true, orden: 20 },
            { campo: 'precio_competidor', tipo: 'numero', label: 'Precio del competidor', placeholder: null, unidad: '$', requerido: true, orden: 30 },
            { campo: 'mi_precio', tipo: 'numero', label: 'Mi precio', placeholder: null, unidad: '$', requerido: true, orden: 40 },
        ],
    },
    { motivoId: 21, nivel: 'ofrecimiento', descripcion: 'DS 100%', resultado: 'perdido', codigo: null, campos: [] },
    { motivoId: 22, nivel: 'ofrecimiento', descripcion: 'Dto', resultado: 'ganado', codigo: null, campos: [] },
    { motivoId: 23, nivel: 'ofrecimiento', descripcion: 'Plazo', resultado: 'ganado', codigo: null, campos: [] },
    { motivoId: 24, nivel: 'ofrecimiento', descripcion: 'Cupo', resultado: 'diferido', codigo: null, campos: [] },
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
    const marca = screen.getByLabelText('Marca del ofrecimiento')
    const objecion = screen.getByText('Objeción')
    // compareDocumentPosition: Node.DOCUMENT_POSITION_FOLLOWING (4) = marca va antes.
    expect(marca.compareDocumentPosition(objecion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([{ motivoId: 20, valores: {} }])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 20, valores: {} }])
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('ofrece cargar una marca', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByLabelText('Marca del ofrecimiento'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

describe('el detalle lo dibuja el módulo del motivo', () => {
    it('sin el motivo tildado no se dibuja nada', () => {
        setup()
        expect(screen.queryByLabelText('Marca')).not.toBeInTheDocument()
    })

    it('tildar Precio dibuja su detalle', () => {
        setup([{ motivoId: 20, valores: {} }])
        expect(screen.getByLabelText('Marca')).toBeInTheDocument()
        expect(screen.getByLabelText('Competidor')).toBeInTheDocument()
    })

    // Un motivo sin campos declarados no tiene formulario: el checkbox es todo lo que hay.
    it('un motivo sin campos declarados no dibuja detalle', () => {
        setup([{ motivoId: 21, valores: {} }])
        expect(screen.queryByLabelText('Competidor')).not.toBeInTheDocument()
    })

    // El codigo solo decide la línea derivada — no si el detalle se dibuja. Un codigo cuyo
    // cálculo todavía no se deployó dibuja los campos igual, sin esa línea.
    it('un codigo sin derivado registrado no rompe: dibuja el detalle igual', () => {
        const raros = motivos.map(m =>
            m.motivoId === 20 ? { ...m, codigo: 'TODAVIA_NO_EXISTE' } : m,
        )
        setup([{ motivoId: 20, valores: {} }], { motivos: raros })
        expect(screen.getByText('Precio')).toBeInTheDocument()
        expect(screen.getByLabelText('Marca')).toBeInTheDocument()
    })

    it('lo que carga el detalle viaja mergeado con lo que ya había', () => {
        const { onChange } = setup([{ motivoId: 20, valores: { marca: 'Fric-Rot' } }])
        fireEvent.change(screen.getByLabelText('Competidor'), {
            target: { value: 'Corven' },
        })
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 20, valores: { marca: 'Fric-Rot', competidor: 'Corven' } },
        ])
    })

    // El aviso de "falta esto" vive junto al campo, no en el pie fijo del wizard (ver
    // ResolucionWizardAcciones): así no empuja los botones de Atrás/Siguiente al aparecer.
    it('con el detalle a medias, avisa junto al propio panel del motivo', () => {
        setup([{ motivoId: 20, valores: {} }])
        expect(screen.getByText(/completá esto para poder avanzar/i)).toBeInTheDocument()
    })

    it('con el detalle completo, no muestra el aviso', () => {
        setup([
            {
                motivoId: 20,
                valores: { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 130 },
            },
        ])
        expect(screen.queryByText(/completá esto para poder avanzar/i)).not.toBeInTheDocument()
    })
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

    // Pendientes acompaña a una objeción y no convive con un cierre: mostrarlo en el
    // segmento Cierre sería ofrecer un tilde que borra lo que el vendedor acaba de cargar.
    it('Pendientes aparece solo en el segmento Objeción', () => {
        setup()
        expect(screen.getByText('Cupo')).toBeInTheDocument()
        expect(screen.getByText('Pendientes')).toBeInTheDocument()

        fireEvent.click(segmento('Cierre'))
        expect(screen.queryByText('Cupo')).not.toBeInTheDocument()
        expect(screen.queryByText('Pendientes')).not.toBeInTheDocument()
    })

    // Cambiar de segmento es cambiar de VISTA, no resetear: si limpiara lo tildado, el
    // vendedor perdería la carga por tocar una pestaña.
    it('cambiar de segmento no borra lo tildado', () => {
        const { onChange } = setup([{ motivoId: 20, valores: {} }])
        fireEvent.click(segmento('Cierre'))
        expect(onChange).not.toHaveBeenCalled()
    })

    // Corolario de lo anterior: lo tildado del otro lado quedaría invisible. El contador
    // en el segmento es lo que evita que se pierda de vista.
    it('el segmento cuenta lo tildado del otro lado', () => {
        setup([
            { motivoId: 20, valores: {} },
            { motivoId: 21, valores: {} },
        ])
        fireEvent.click(segmento('Cierre'))
        expect(segmento('Objeción')).toHaveTextContent('2')
    })

    // Los pendientes se esconden junto con Objeción, así que sin esto un Cupo tildado
    // quedaría invisible Y sin contar al pasar a Cierre.
    it('el contador de Objeción incluye los pendientes tildados', () => {
        setup([
            { motivoId: 20, valores: {} }, // Precio
            { motivoId: 24, valores: {} }, // Cupo
        ])
        fireEvent.click(segmento('Cierre'))
        expect(segmento('Objeción')).toHaveTextContent('2')
    })

    // Al retomar un borrador, abre donde está la carga en vez de obligar a buscarla.
    it('con un Cierre ya tildado, abre en Cierre', () => {
        setup([{ motivoId: 22, valores: {} }])
        expect(screen.getByText('Dto')).toBeInTheDocument()
        expect(screen.queryByText('Precio')).not.toBeInTheDocument()
    })

    it('un motivo sin bucket reconocido (no_ofrecido o null) cae en Otros, sin perderse', () => {
        setup([], {
            motivos: [
                ...motivos,
                { motivoId: 30, nivel: 'ofrecimiento', descripcion: 'Fuera de catálogo', resultado: 'no_ofrecido', codigo: null, campos: [] },
            ],
        })
        expect(screen.getByText('Otros')).toBeInTheDocument()
        expect(screen.getByText('Fuera de catálogo')).toBeInTheDocument()
    })

    it('sin motivos de un bucket, no muestra su título', () => {
        setup([], { motivos: motivos.filter(m => m.resultado !== 'diferido') })
        expect(screen.queryByText('Pendientes')).not.toBeInTheDocument()
    })

    // Catálogo a medio migrar: sin ningún 'perdido', el único bloque es Cierre. Pendientes
    // no puede colarse ahí — no convive con un cierre.
    it('con Cierre como único bloque, no muestra Pendientes', () => {
        setup([], { motivos: motivos.filter(m => m.resultado !== 'perdido') })
        expect(screen.getByText('Dto')).toBeInTheDocument()
        expect(screen.queryByText('Cupo')).not.toBeInTheDocument()
    })

    // Y al revés: si NO hay nada con qué entrar en conflicto, los pendientes se muestran.
    it('con Pendientes como único grupo del catálogo, se muestran igual', () => {
        setup([], { motivos: motivos.filter(m => m.resultado === 'diferido') })
        expect(screen.getByText('Pendientes')).toBeInTheDocument()
        expect(screen.getByText('Cupo')).toBeInTheDocument()
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
        setup([{ motivoId: 22, valores: {} }])
        const boton = screen.getByText('Dto').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#9BE3B4', background: '#EAFBF1' })
    })

    it('diferido se tilda en amarillo', () => {
        setup([{ motivoId: 24, valores: {} }])
        const boton = screen.getByText('Cupo').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F7DD8F', background: '#FEF9E8' })
    })

    it('perdido se tilda en naranja', () => {
        setup([{ motivoId: 20, valores: {} }])
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F3C8A0', background: '#FDF2E9' })
    })
})

// Qué puede convivir con qué. Una objeción puede dejar algo pendiente ("no me compró
// por precio, pero le queda el cupo"), así que perdido + diferido conviven. Un cierre
// no: si cerró, no quedó nada pendiente ni objetado.
describe('qué resoluciones conviven', () => {
    const PRECIO = { motivoId: 20, valores: {} }
    const DS100 = { motivoId: 21, valores: {} }
    const DTO = { motivoId: 22, valores: {} }
    const CUPO = { motivoId: 24, valores: {} }

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

    // Con un Cierre tildado el formulario abre en Cierre, donde Pendientes no se ofrece:
    // llegar al Cupo exige volver a Objeción. La regla se verifica igual — es la red que
    // sostiene el invariante aunque el layout ya lo haga difícil de romper.
    it('y al revés: tildar un Pendiente borra el Cierre ya tildado', () => {
        const { onChange } = setup([DTO])
        fireEvent.click(screen.getByRole('button', { name: /objeción/i }))
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

it('un motivo con campos declarados dibuja su detalle al tildarlo', () => {
    setup([{ motivoId: 20, valores: {} }])

    // "Mi precio ($)" con la unidad entre paréntesis solo lo produce el renderizador
    // genérico: el Editor viejo rotulaba "Mi precio" a secas. Es lo que hace que este test
    // distinga una implementación de la otra y no pase por accidente.
    expect(screen.getByLabelText('Mi precio ($)')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio del competidor ($)')).toBeInTheDocument()
})

it('un motivo sin campos declarados no dibuja detalle', () => {
    setup([{ motivoId: 21, valores: {} }])

    expect(screen.queryByLabelText(/mi precio/i)).not.toBeInTheDocument()
})
