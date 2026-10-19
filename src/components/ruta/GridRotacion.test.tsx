import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GridRotacion, { movimientoDeDrop, parsearCelda } from './GridRotacion'
import type { ISemanaRotacionAdmin } from '@/types/planificacion'

const vacia = () => ({ LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] })

const SEMANAS: ISemanaRotacionAdmin[] = [
    {
        semana: 1,
        descripcion: 'Zona Norte',
        dias: {
            ...vacia(),
            LUN: [
                {
                    rotacionClienteId: 11,
                    codigoParticularCliente: 'P001',
                    nombreCliente: 'Kiosco Uno',
                    dia: 1,
                    estado: 'pendiente',
                    visitaId: null,
                    ofrecimientosPendientes: 0,
                    ultimoMovimiento: null,
                },
            ] as never,
        },
    },
    { semana: 3, descripcion: null, dias: vacia() },
]

describe('GridRotacion', () => {
    it('rotula cada semana con su número y su zona', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(screen.getByText(/Zona Norte/)).toBeInTheDocument()
    })

    it('muestra las semanas vacías del set, no solo las que tienen clientes', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        // La semana 3 existe en el set y no tiene ni un cliente: tiene que estar igual,
        // porque es una celda válida para soltarle una card encima.
        expect(screen.getByText(/Semana 3/)).toBeInTheDocument()
    })

    it('marca la semana en curso con su lunes y la ya recorrida como hecha', () => {
        const semanas: ISemanaRotacionAdmin[] = [
            { semana: 1, descripcion: 'Zona Norte', estado: 'hecha', fechaLunes: '2026-10-06', dias: vacia() },
            { semana: 2, descripcion: 'Zárate', estado: 'en_curso', fechaLunes: '2026-10-13', dias: vacia() },
            { semana: 3, descripcion: null, estado: 'pendiente', fechaLunes: null, dias: vacia() },
        ]
        render(<GridRotacion semanas={semanas} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)

        expect(screen.getByText('En curso · semana del 13/10')).toBeInTheDocument()
        expect(screen.getByText('Hecha · semana del 06/10')).toBeInTheDocument()
        expect(screen.queryAllByText(/En curso|Hecha/)).toHaveLength(2)
    })

    it('encabeza las cinco columnas de días', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        for (const dia of ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']) {
            expect(screen.getByText(dia)).toBeInTheDocument()
        }
    })

    it('pone cada cliente en la celda de su día', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onRenombrarSemana={vi.fn()} onIntercambiar={vi.fn()} />)
        const celda = screen.getByTestId('celda-1-LUN')
        expect(celda).toContainElement(screen.getByTestId('card-cliente-11'))
    })

    it('sin onAgregar no dibuja ningún "+"', () => {
        render(
            <GridRotacion
                semanas={SEMANAS}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
            />,
        )
        expect(screen.queryByLabelText(/^Agregar cliente:/)).not.toBeInTheDocument()
    })

    it('con onAgregar hay un "+" por celda, y avisa qué celda se tocó', async () => {
        const onAgregar = vi.fn()
        render(
            <GridRotacion
                semanas={SEMANAS}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
                onAgregar={onAgregar}
            />,
        )

        // 2 semanas × 5 días.
        expect(screen.getAllByLabelText(/^Agregar cliente:/)).toHaveLength(10)

        await userEvent.click(
            screen.getByLabelText('Agregar cliente: semana 3, JUE'),
        )
        expect(onAgregar).toHaveBeenCalledWith(3, 4)
    })
})

/** Dónde está hoy cada fila, como lo resolvería el grid a partir de sus semanas. */
const origenDe = (id: number) => (id === 11 ? { semana: 1, dia: 1 } : undefined)

describe('movimientoDeDrop', () => {
    it('traduce el drop a la fila y el destino', () => {
        expect(movimientoDeDrop('card-11', 'celda-3-JUE', origenDe)).toEqual({
            rotacionClienteId: 11,
            semana: 3,
            dia: 4,
        })
    })

    it('soltar en la misma celda no es un movimiento', () => {
        // Sin esto, cancelar un arrastre devolviendo la card a su lugar generaría un PATCH
        // y una fila de bitácora por cada intento.
        expect(movimientoDeDrop('card-11', 'celda-1-LUN', origenDe)).toBeNull()
    })

    it('soltar afuera de toda celda no es un movimiento', () => {
        expect(movimientoDeDrop('card-11', null, origenDe)).toBeNull()
    })

    it('ignora ids que no son de una card o de una celda', () => {
        expect(movimientoDeDrop('otra-cosa', 'celda-3-JUE', origenDe)).toBeNull()
        expect(movimientoDeDrop('card-11', 'header-LUN', origenDe)).toBeNull()
    })
})

describe('parsearCelda', () => {
    it('mapea cada día a su índice 1..5', () => {
        expect(parsearCelda('celda-2-LUN')).toEqual({ semana: 2, dia: 1 })
        expect(parsearCelda('celda-2-VIE')).toEqual({ semana: 2, dia: 5 })
    })

    it('null si el id no es de una celda', () => {
        expect(parsearCelda('card-11')).toBeNull()
    })
})

describe('intercambiar días', () => {
    const props = () => ({
        semanas: SEMANAS,
        onMover: vi.fn(),
        onRenombrarSemana: vi.fn(),
        onIntercambiar: vi.fn(),
    })

    it('cada celda ofrece iniciar un intercambio', () => {
        render(<GridRotacion {...props()} />)
        // 2 semanas × 5 días
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('al elegir el origen, las demás celdas pasan a ser destino', async () => {
        render(<GridRotacion {...props()} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )

        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        ).toBeInTheDocument()
        expect(
            screen.getAllByRole('button', { name: /intercambiar con este día/i }),
        ).toHaveLength(9)
    })

    it('el segundo click avisa las dos celdas y sale del modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Intercambiar con este día: semana 3, JUE',
            }),
        )

        // Entre semanas distintas: es el caso que un menú por columna no cubriría.
        expect(p.onIntercambiar).toHaveBeenCalledWith(
            { semana: 1, dia: 1 },
            { semana: 3, dia: 4 },
        )
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('volver a tocar el origen cancela', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.click(
            screen.getByRole('button', { name: 'Cancelar intercambio: semana 1, LUN' }),
        )

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('Escape cancela el modo', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Intercambiar este día: semana 1, LUN' }),
        )
        await userEvent.keyboard('{Escape}')

        expect(p.onIntercambiar).not.toHaveBeenCalled()
        expect(
            screen.getAllByRole('button', { name: /intercambiar este día/i }),
        ).toHaveLength(10)
    })

    it('sin editable no se ofrece intercambiar', () => {
        render(<GridRotacion {...props()} editable={false} />)
        expect(
            screen.queryByRole('button', { name: /intercambiar este día/i }),
        ).not.toBeInTheDocument()
    })
})

describe('chip de la fila creada a mano', () => {
    /** Una fila cualquiera del plan, con lo que la card necesita. */
    const fila = (id: number, codigo: string, dia: number, esExtra = false, eliminado = false) =>
        ({
            rotacionClienteId: id,
            codigoParticularCliente: codigo,
            nombreCliente: `Cliente ${codigo}`,
            dia,
            estado: 'pendiente',
            ultimoMovimiento: null,
            esExtra,
            eliminado,
        }) as never

    it('la extra de un cliente que no está en ninguna otra celda dice AGREGADO', () => {
        const semanas = [
            { semana: 1, descripcion: null, dias: { ...vacia(), LUN: [fila(11, 'P001', 1, true)] } },
        ]
        render(
            <GridRotacion
                semanas={semanas as never}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
            />,
        )

        expect(screen.getByText('Agregado')).toBeInTheDocument()
    })

    it('la extra de un cliente que YA tiene fila en otra semana dice EXTRA', () => {
        // El caso del quincenal al que le sumaron una pasada, o del cliente que ya
        // estaba planificado y se agregó igual: dos visitas al mismo cliente.
        const semanas = [
            { semana: 1, descripcion: null, dias: { ...vacia(), LUN: [fila(11, 'P001', 1)] } },
            { semana: 3, descripcion: null, dias: { ...vacia(), MAR: [fila(12, 'P001', 2, true)] } },
        ]
        render(
            <GridRotacion
                semanas={semanas as never}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
            />,
        )

        expect(screen.getByText('Extra')).toBeInTheDocument()
        expect(screen.queryByText('Agregado')).not.toBeInTheDocument()
    })

    it('una fila QUITADA no cuenta como la otra visita', () => {
        // Si la planificada se quitó, la extra pasó a ser la única visita del cliente en
        // la vuelta: llamarla "extra" diría que hay dos cuando hay una.
        const semanas = [
            {
                semana: 1,
                descripcion: null,
                dias: { ...vacia(), LUN: [fila(11, 'P001', 1, false, true)] },
            },
            { semana: 3, descripcion: null, dias: { ...vacia(), MAR: [fila(12, 'P001', 2, true)] } },
        ]
        render(
            <GridRotacion
                semanas={semanas as never}
                onMover={vi.fn()}
                onRenombrarSemana={vi.fn()}
                onIntercambiar={vi.fn()}
            />,
        )

        expect(screen.getByText('Agregado')).toBeInTheDocument()
        expect(screen.queryByText('Extra')).not.toBeInTheDocument()
    })
})

describe('tooltips de los botones de la celda', () => {
    // No es cosmética: los tres controles de esta pantalla mueven cosas distintas del
    // plan, y el efecto de intercambiar (permuta TODOS los clientes de dos días) no se
    // puede adivinar del ícono. Si el texto se cae, el botón vuelve a ser un glifo mudo.
    const props = () => ({
        semanas: SEMANAS,
        onMover: vi.fn(),
        onRenombrarSemana: vi.fn(),
        onIntercambiar: vi.fn(),
        onAgregar: vi.fn(),
    })

    it('el de intercambiar explica que permuta el día completo', () => {
        render(<GridRotacion {...props()} />)

        expect(
            screen.getByLabelText('Intercambiar este día: semana 1, LUN'),
        ).toHaveAttribute('title', expect.stringContaining('todos sus clientes'))
    })

    it('el de agregar aclara que también se puede traer una visita existente', () => {
        render(<GridRotacion {...props()} />)

        expect(screen.getByLabelText('Agregar cliente: semana 1, LUN')).toHaveAttribute(
            'title',
            expect.stringContaining('traer'),
        )
    })
})

describe('intercambiar semanas', () => {
    const vaciaS = (semana: number, estado?: 'pendiente' | 'en_curso' | 'hecha') => ({
        semana,
        descripcion: null,
        estado,
        dias: vacia(),
    })
    const props = () => ({
        semanas: [vaciaS(1), vaciaS(2), vaciaS(3)],
        onMover: vi.fn(),
        onRenombrarSemana: vi.fn(),
        onIntercambiar: vi.fn(),
        onIntercambiarSemanas: vi.fn(),
    })

    it('el primer toque marca el origen y el segundo avisa las dos semanas', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 1' }))
        expect(
            screen.getByRole('button', { name: 'Cancelar intercambio de semanas: semana 1' }),
        ).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar con esta semana: semana 3' }))

        expect(p.onIntercambiarSemanas).toHaveBeenCalledWith(1, 3)
        expect(screen.getAllByRole('button', { name: /^Intercambiar esta semana/ })).toHaveLength(3)
    })

    it('tocar el origen de nuevo cancela', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 2' }))
        await userEvent.click(
            screen.getByRole('button', { name: 'Cancelar intercambio de semanas: semana 2' }),
        )

        expect(p.onIntercambiarSemanas).not.toHaveBeenCalled()
        expect(screen.getAllByRole('button', { name: /^Intercambiar esta semana/ })).toHaveLength(3)
    })

    it('Escape cancela', async () => {
        const p = props()
        render(<GridRotacion {...p} />)

        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 2' }))
        await userEvent.keyboard('{Escape}')
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 3' }))

        // Después de Escape, el toque en la semana 3 arma un origen nuevo: no intercambia.
        expect(p.onIntercambiarSemanas).not.toHaveBeenCalled()
    })

    it('solo se ofrece en las semanas que el caller habilita', () => {
        const p = props()
        p.semanas = [vaciaS(1, 'hecha'), vaciaS(2, 'en_curso'), vaciaS(3, 'pendiente'), vaciaS(4, 'pendiente')]
        render(<GridRotacion {...p} semanaIntercambiable={s => s.estado === 'pendiente'} />)

        expect(
            screen.getAllByRole('button', { name: /^Intercambiar esta semana/ }).map(b => b.getAttribute('aria-label')),
        ).toEqual(['Intercambiar esta semana: semana 3', 'Intercambiar esta semana: semana 4'])
    })

    it('sin onIntercambiarSemanas o sin editable no se ofrece', () => {
        const { onIntercambiarSemanas: _, ...sinCallback } = props()
        const { unmount } = render(<GridRotacion {...sinCallback} />)
        expect(screen.queryByRole('button', { name: /semana: semana/ })).not.toBeInTheDocument()
        unmount()

        render(<GridRotacion {...props()} editable={false} />)
        expect(screen.queryByRole('button', { name: /semana: semana/ })).not.toBeInTheDocument()
    })
})

describe('nombre de la semana', () => {
    it('sin onRenombrarSemana muestra la zona como texto, sin editor', () => {
        render(<GridRotacion semanas={SEMANAS} onMover={vi.fn()} onIntercambiar={vi.fn()} />)

        expect(screen.getByText('Zona Norte')).toBeInTheDocument()
        expect(screen.getByText('Sin zona')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Nombrar semana/ })).not.toBeInTheDocument()
    })
})

describe('texto de quitar', () => {
    const conPendiente: ISemanaRotacionAdmin[] = [
        {
            semana: 1,
            descripcion: null,
            dias: {
                ...vacia(),
                LUN: [
                    {
                        rotacionClienteId: 41,
                        codigoParticularCliente: 'P1',
                        nombreCliente: 'KIOSCO UNO',
                        dia: 1,
                        estado: 'pendiente',
                        esExtra: false,
                        eliminado: false,
                        ultimoMovimiento: null,
                    },
                ],
            },
        },
    ]

    it('el caller puede decir de dónde se quita y qué pasa después', async () => {
        const onQuitar = vi.fn()
        render(
            <GridRotacion
                semanas={conPendiente}
                onMover={vi.fn()}
                onIntercambiar={vi.fn()}
                onQuitar={onQuitar}
                textoQuitar={{ donde: 'de la ruta base', aviso: 'No va a estar en las próximas vueltas.' }}
            />,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Quitar de la ruta base: Kiosco Uno' }))
        expect(screen.getByText('¿Quitar a Kiosco Uno de la ruta base?')).toBeInTheDocument()
        expect(screen.getByText('No va a estar en las próximas vueltas.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))

        expect(onQuitar).toHaveBeenCalledWith(41)
    })
})

/** Una card mínima del grid, para contar clientes por día. */
const cliente = (id: number, nombre: string, extra: Record<string, unknown> = {}) => ({
    rotacionClienteId: id,
    codigoParticularCliente: `P${id}`,
    nombreCliente: nombre,
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    ofrecimientosPendientes: 0,
    ultimoMovimiento: null,
    ...extra,
})

/** Una vuelta: la 1 hecha, la 2 en curso (con un cliente) y la 3 pendiente (con tres vivos). */
const VUELTA: ISemanaRotacionAdmin[] = [
    { semana: 1, descripcion: 'Zona Norte', estado: 'hecha', fechaLunes: '2026-10-06', dias: vacia() },
    {
        semana: 2,
        descripcion: 'Zárate',
        estado: 'en_curso',
        fechaLunes: '2026-10-13',
        dias: { ...vacia(), MAR: [cliente(21, 'Kiosco Dos')] as never },
    },
    {
        semana: 3,
        descripcion: 'Campana',
        estado: 'pendiente',
        fechaLunes: null,
        dias: {
            ...vacia(),
            LUN: [cliente(31, 'Almacén Tres'), cliente(32, 'Almacén Cuatro')] as never,
            JUE: [cliente(33, 'Almacén Cinco'), cliente(34, 'Quitado Seis', { eliminado: true })] as never,
        },
    },
]

function renderVuelta(props: Partial<Parameters<typeof GridRotacion>[0]> = {}) {
    return render(
        <GridRotacion
            semanas={VUELTA}
            onMover={vi.fn()}
            onIntercambiar={vi.fn()}
            onAgregar={vi.fn()}
            onIntercambiarSemanas={vi.fn()}
            plegarPorEstado
            {...props}
        />,
    )
}

describe('semanas plegables', () => {
    it('en la vuelta arranca desplegada solo la semana en curso', () => {
        renderVuelta()

        expect(screen.getByTestId('card-cliente-21')).toBeInTheDocument()
        expect(screen.queryByTestId('card-cliente-31')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Plegar semana 2' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Desplegar semana 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Desplegar semana 3' })).toBeInTheDocument()
    })

    it('sin semana en curso arranca desplegada la primera pendiente', () => {
        const sinEnCurso = VUELTA.map(s => (s.semana === 2 ? { ...s, estado: 'hecha' as const } : s))
        renderVuelta({ semanas: sinEnCurso })

        expect(screen.getByTestId('card-cliente-31')).toBeInTheDocument()
        expect(screen.queryByTestId('card-cliente-21')).not.toBeInTheDocument()
    })

    it('en la ruta base (sin plegarPorEstado) arranca todo desplegado', () => {
        renderVuelta({ plegarPorEstado: undefined })

        expect(screen.getByTestId('card-cliente-21')).toBeInTheDocument()
        expect(screen.getByTestId('card-cliente-31')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Desplegar semana/ })).not.toBeInTheDocument()
    })

    it('plegada, la semana muestra zona y clientes por día sin contar los quitados, y oculta las cards', async () => {
        renderVuelta()

        expect(screen.getByText('LUN 2 · MAR 0 · MIE 0 · JUE 1 · VIE 0')).toBeInTheDocument()
        expect(screen.getByText('Campana')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Plegar semana 2' }))
        expect(screen.queryByTestId('card-cliente-21')).not.toBeInTheDocument()
        expect(screen.getByText('LUN 0 · MAR 1 · MIE 0 · JUE 0 · VIE 0')).toBeInTheDocument()
        // La etiqueta de estado sigue a la vista con la fila plegada.
        expect(screen.getByText('En curso · semana del 13/10')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Desplegar semana 3' }))
        expect(screen.getByTestId('card-cliente-31')).toBeInTheDocument()
        expect(screen.queryByText('LUN 2 · MAR 0 · MIE 0 · JUE 1 · VIE 0')).not.toBeInTheDocument()
    })

    it('"Desplegar todas" y "Plegar todas" afectan a todas las semanas', async () => {
        renderVuelta()

        await userEvent.click(screen.getByRole('button', { name: 'Desplegar todas' }))
        expect(screen.getByTestId('card-cliente-21')).toBeInTheDocument()
        expect(screen.getByTestId('card-cliente-31')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Plegar todas' }))
        expect(screen.queryByTestId('card-cliente-21')).not.toBeInTheDocument()
        expect(screen.queryByTestId('card-cliente-31')).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /^Desplegar semana/ })).toHaveLength(3)
    })

    it('una semana plegada no ofrece "+ cliente" ni ⇄, pero sí el ⇅', () => {
        renderVuelta()

        expect(screen.getByLabelText('Agregar cliente: semana 2, MAR')).toBeInTheDocument()
        expect(screen.queryByLabelText(/^Agregar cliente: semana 3/)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/^Intercambiar este día: semana 3/)).not.toBeInTheDocument()
        expect(screen.queryByTestId('celda-3-LUN')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Intercambiar esta semana: semana 3' })).toBeInTheDocument()
    })

    it('plegar la semana del ⇄ armado lo cancela', async () => {
        const onIntercambiar = vi.fn()
        renderVuelta({ onIntercambiar })

        await userEvent.click(screen.getByRole('button', { name: 'Desplegar todas' }))
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar este día: semana 3, LUN' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plegar semana 3' }))

        expect(screen.queryByRole('button', { name: /^Cancelar intercambio/ })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Intercambiar este día: semana 2, MAR' }))
        expect(onIntercambiar).not.toHaveBeenCalled()
    })
})

describe('vista compacta', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => vi.restoreAllMocks())

    it('arranca normal: la card muestra el código del cliente', () => {
        renderVuelta({ plegarPorEstado: undefined })
        expect(screen.getByTestId('card-cliente-21')).toHaveTextContent('P21')
    })

    it('el toggle pasa las cards a una línea con solo el nombre y lo recuerda', async () => {
        const { unmount } = renderVuelta({ plegarPorEstado: undefined })

        await userEvent.click(screen.getByRole('button', { name: 'Compacta' }))
        const card = screen.getByTestId('card-cliente-21')
        expect(card).toHaveTextContent('Kiosco Dos')
        expect(card).not.toHaveTextContent('P21')
        expect(localStorage.getItem('ruta-vista-compacta')).toBe('1')

        unmount()
        renderVuelta({ plegarPorEstado: undefined })
        expect(screen.getByTestId('card-cliente-21')).not.toHaveTextContent('P21')
        expect(screen.getByRole('button', { name: 'Compacta' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('si el storage tira, arranca normal y el toggle igual funciona', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage bloqueado')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage bloqueado')
        })
        renderVuelta({ plegarPorEstado: undefined })

        expect(screen.getByTestId('card-cliente-21')).toHaveTextContent('P21')
        await userEvent.click(screen.getByRole('button', { name: 'Compacta' }))
        expect(screen.getByTestId('card-cliente-21')).not.toHaveTextContent('P21')
    })
})
