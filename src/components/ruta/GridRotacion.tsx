import { useEffect, useState } from 'react'
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useDndContext,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import ClienteCardRuta from './ClienteCardRuta'
import DescripcionInline from './DescripcionInline'
import type { Dia, IAgendaClientAdmin, ISemanaRotacionAdmin } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/**
 * Las opciones viven a nivel módulo, NO como objeto literal dentro del `useSensor`:
 * `useSensor` memoiza con `[sensor, options]`, así que un literal nuevo en cada render
 * invalida el memo, `useSensors` devuelve otro array y el `useSensorSetup` de dnd-kit
 * desarma y rearma los sensores en cada render.
 *
 * (No confundir con el arrastre que se sentía tildado: se midió y NO era esto. El costo
 * estaba en re-renderizar las 150 cards — ver el comentario de `Cuerpo` en
 * `ClienteCardRuta`. Esto es higiene, no la solución de ese problema.)
 */
const OPCIONES_MOUSE = { activationConstraint: { distance: 3 } }
const OPCIONES_TOUCH = { activationConstraint: { delay: 220, tolerance: 8 } }

/** `celda-3-JUE` → `{ semana: 3, dia: 4 }`. null si el id no es de una celda. */
export function parsearCelda(id: string): { semana: number; dia: number } | null {
    const m = /^celda-(\d+)-(LUN|MAR|MIE|JUE|VIE)$/.exec(id)
    if (!m) return null
    return { semana: Number(m[1]), dia: DIAS.indexOf(m[2] as Dia) + 1 }
}

/** `card-11` → 11. null si el id no es de una card. */
export function parsearCard(id: string): number | null {
    const m = /^card-(\d+)$/.exec(id)
    return m ? Number(m[1]) : null
}

/**
 * Qué movimiento implica un drop, o null si no implica ninguno.
 *
 * Función pura y exportada para poder probar la regla sin simular un arrastre de
 * puntero: los tres casos que no son movimiento (soltar afuera, soltar en la misma
 * celda, ids que no matchean) son justamente los que hay que blindar.
 */
export function movimientoDeDrop(
    activeId: string,
    overId: string | null,
    origenDe: (rotacionClienteId: number) => { semana: number; dia: number } | undefined,
): { rotacionClienteId: number; semana: number; dia: number } | null {
    if (!overId) return null
    const rotacionClienteId = parsearCard(activeId)
    const destino = parsearCelda(overId)
    if (rotacionClienteId === null || !destino) return null

    const origen = origenDe(rotacionClienteId)
    // Soltar donde ya estaba no es un movimiento: evita un PATCH y una fila de bitácora
    // por cada arrastre que el usuario cancela devolviendo la card a su lugar.
    if (origen && origen.semana === destino.semana && origen.dia === destino.dia) {
        return null
    }
    return { rotacionClienteId, ...destino }
}

interface Celda {
    semana: number
    dia: number
}

/**
 * Códigos de cliente con MÁS DE UNA visita viva en la rotación.
 *
 * Es lo que distingue los dos hechos que `es_extra` mezcla en un solo booleano: una fila
 * creada a mano de un cliente que la vuelta no tenía es cartera que se sumó ("Agregado"),
 * y la de un cliente que ya estaba planificado es una pasada de más ("Extra"), con su
 * fila original todavía pendiente en otra celda.
 *
 * Las filas quitadas no cuentan: si la planificada se quitó, la extra pasó a ser la única
 * visita del cliente en la vuelta, y llamarla "extra" diría que hay dos cuando hay una.
 */
export function clientesConVariasVisitas(semanas: ISemanaRotacionAdmin[]): Set<string> {
    const veces = new Map<string, number>()
    for (const semana of semanas) {
        for (const dia of DIAS) {
            for (const cliente of semana.dias[dia]) {
                if (cliente.eliminado) continue
                const codigo = cliente.codigoParticularCliente
                veces.set(codigo, (veces.get(codigo) ?? 0) + 1)
            }
        }
    }
    return new Set([...veces].filter(([, n]) => n > 1).map(([codigo]) => codigo))
}

interface CeldaProps {
    semana: number
    dia: Dia
    clientes: IAgendaClientAdmin[]
    arrastrable: boolean
    /** false = rotación cerrada: no se ofrece intercambiar. */
    intercambiable: boolean
    /** Esta celda es el origen del intercambio en curso. */
    esOrigen: boolean
    /** Hay un intercambio empezado en OTRA celda: esta es un destino posible. */
    esDestinoPosible: boolean
    onTocarIntercambio: (celda: { semana: number; dia: number }) => void
    /** Ausente = no se ofrece quitar en esta celda. */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar en esta celda. */
    onRestaurar?: (rotacionClienteId: number) => void
    /** Clientes con más de una visita viva en la vuelta: decide el chip de las extras. */
    conVariasVisitas: Set<string>
    /** Ausente = no se ofrece agregar un cliente en esta celda. */
    onAgregar?: (celda: { semana: number; dia: number }) => void
}

function Celda({
    semana,
    dia,
    clientes,
    arrastrable,
    intercambiable,
    esOrigen,
    esDestinoPosible,
    onTocarIntercambio,
    onQuitar,
    onRestaurar,
    onAgregar,
    conVariasVisitas,
}: CeldaProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `celda-${semana}-${dia}` })

    // El label lleva semana y día porque hay 25 celdas: sin eso, 25 botones con el mismo
    // nombre accesible son indistinguibles para un lector de pantalla y para los tests.
    const etiqueta = esOrigen
        ? 'Cancelar intercambio'
        : esDestinoPosible
          ? 'Intercambiar con este día'
          : 'Intercambiar este día'

    return (
        <td
            ref={setNodeRef}
            data-testid={`celda-${semana}-${dia}`}
            className={`min-w-40 space-y-1 rounded-md p-1.5 align-top ${
                isOver ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-white'
            } ${esOrigen ? 'ring-2 ring-slate-900' : ''}`}
        >
            {/* La barra de acciones de la celda. El "+" va ACÁ y no en el header de la
                columna de día (como decía el spec): el grid tiene 5 columnas × N semanas,
                así que un botón en el header no identifica ninguna semana — y el requisito
                es justamente que la celda destino quede fijada por el botón que se tocó,
                sin selector de semana/día en el modal. */}
            {(intercambiable || onAgregar) && (
                <div className="mb-1 flex gap-1">
                    {intercambiable && (
                        <button
                            type="button"
                            aria-label={`${etiqueta}: semana ${semana}, ${dia}`}
                            // `dia` acá es la clave ('LUN'), pero el estado del intercambio
                            // guarda el número (1..5) que viaja al backend — misma
                            // conversión que ya usa `parsearCelda`. Sin esto, la celda de
                            // origen nunca se reconoce a sí misma y todas las celdas se
                            // muestran como destino posible.
                            onClick={() =>
                                onTocarIntercambio({ semana, dia: DIAS.indexOf(dia) + 1 })
                            }
                            className={`flex-1 rounded border border-dashed px-1 py-0.5 text-[10px] font-medium ${
                                esOrigen
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : esDestinoPosible
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {esOrigen ? 'Cancelar' : esDestinoPosible ? 'Intercambiar acá' : '⇄'}
                        </button>
                    )}
                    {onAgregar && (
                        <button
                            type="button"
                            // El label lleva semana y día porque hay 25 celdas: sin eso,
                            // 25 botones con el mismo nombre accesible son
                            // indistinguibles para un lector de pantalla y para los tests.
                            aria-label={`Agregar cliente: semana ${semana}, ${dia}`}
                            onClick={() => onAgregar({ semana, dia: DIAS.indexOf(dia) + 1 })}
                            className="rounded border border-dashed border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-400 hover:text-slate-600"
                        >
                            +
                        </button>
                    )}
                </div>
            )}
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    visitaAdicional={conVariasVisitas.has(cliente.codigoParticularCliente)}
                    arrastrable={arrastrable}
                    onQuitar={arrastrable ? onQuitar : undefined}
                    onRestaurar={arrastrable ? onRestaurar : undefined}
                />
            ))}
        </td>
    )
}

/**
 * La copia que viaja con el cursor. Lee la card activa del contexto de dnd-kit en vez de
 * recibirla por prop a propósito: guardarla en un estado de `GridRotacion` obligaba a un
 * `setState` en el `onDragStart`, y eso re-renderizaba la grilla entera —25 celdas, ~150
 * cards, cada una con su `useDraggable`— exactamente en el instante de agarrar. Medido con
 * 150 cards: el pickup pasaba de un longtask de 90ms a uno de 214ms y el feedback visual
 * de 0 a 280ms. Se sentía tildado, que es justo lo que el overlay venía a mejorar.
 *
 * `DragOverlay` no monta a sus hijos si no hay arrastre, así que esto solo existe en vuelo.
 */
function CardArrastrada({ semanas }: { semanas: ISemanaRotacionAdmin[] }) {
    const { active } = useDndContext()
    const id = active ? parsearCard(String(active.id)) : null
    if (id === null) return null

    for (const semana of semanas) {
        for (const dia of DIAS) {
            const cliente = semana.dias[dia].find(c => c.rotacionClienteId === id)
            if (cliente) return <ClienteCardRuta cliente={cliente} overlay />
        }
    }
    return null
}

interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    onRenombrarSemana: (semana: number, descripcion: string | null) => void
    onIntercambiar: (a: Celda, b: Celda) => void
    /** Ausente = no se ofrece quitar (rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar (rotación no editable). */
    onRestaurar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece agregar clientes. Presente, se ofrece en toda celda de una
     *  rotación editable: el grid lo silencia solo si `editable` es false. */
    onAgregar?: (semana: number, dia: number) => void
    /** false = rotación cerrada: se ve pero no se toca. */
    editable?: boolean
}

/**
 * El plan completo de una rotación: una fila por semana, cinco columnas de día.
 *
 * Las semanas salen del payload tal como vienen —incluidas las vacías— porque el backend
 * las deriva del SET de la rotación (`pl_rotacion_semana`) y no de los clientes. Una
 * semana sin clientes sigue siendo un destino válido para arrastrar una card.
 */
export default function GridRotacion({
    semanas,
    onMover,
    onRenombrarSemana,
    onIntercambiar,
    onQuitar,
    onRestaurar,
    onAgregar,
    editable,
}: GridRotacionProps) {
    // `editable` ausente = editable, por compatibilidad con los callers viejos. Se resuelve
    // UNA vez: las tres acciones de celda (arrastrar, intercambiar, agregar) tienen que
    // aparecer y desaparecer juntas, y repetir la expresión es como se desincronizan.
    const seEdita = editable ?? true

    // Una sola pasada por las ~150 filas, no una por card: el chip de cada extra depende
    // de la vuelta completa, no de la fila.
    const conVariasVisitas = clientesConVariasVisitas(semanas)

    // Celda origen del intercambio en curso. null = no hay intercambio empezado.
    const [origen, setOrigen] = useState<Celda | null>(null)


    /**
     * Sin `sensors`, dnd-kit usa el PointerSensor sin `activationConstraint`: el arrastre
     * arranca en el mismo pointerdown, así que un click cualquiera sobre la card ya la
     * atenuaba y la "enganchaba" (medido: `translate3d(0,0,0)` + opacity .5 sin mover un
     * píxel). Con umbral, un click es un click y un arrastre es un arrastre — que es lo
     * que hace usable tener botones dentro de la card.
     *
     * 3px y no 8: el umbral es tiempo en el que la card todavía no reaccionó, y con 6px
     * el arranque ya se sentía trabado. 3px alcanza para descartar el temblor de un
     * click (medido: un click limpio y un micro-movimiento de 1-2px no arrastran).
     *
     * En touch el umbral por distancia no sirve: competiría con el scroll de la grilla,
     * que es ancha y se scrollea en horizontal. Ahí se usa mantener apretado (220ms),
     * el gesto que el sistema ya asocia con "agarrar y mover".
     *
     * El KeyboardSensor se declara explícito: al pasar `sensors` se reemplaza la lista
     * por defecto, y sin él se perdía el arrastre por teclado.
     */
    const sensores = useSensors(
        useSensor(MouseSensor, OPCIONES_MOUSE),
        useSensor(TouchSensor, OPCIONES_TOUCH),
        useSensor(KeyboardSensor),
    )

    // Escape cancela: es la salida que el usuario espera de un modo, y sin ella la única
    // forma de salir era acertarle de nuevo al botón de origen.
    useEffect(() => {
        if (!origen) return
        const alTecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOrigen(null)
        }
        window.addEventListener('keydown', alTecla)
        return () => window.removeEventListener('keydown', alTecla)
    }, [origen])

    const tocarCelda = (celda: Celda) => {
        if (!origen) {
            setOrigen(celda)
            return
        }
        if (origen.semana === celda.semana && origen.dia === celda.dia) {
            setOrigen(null) // volver a tocar el origen cancela
            return
        }
        onIntercambiar(origen, celda)
        setOrigen(null)
    }

    // Índice fila → su posición actual, para descartar el drop en la misma celda.
    const origenDe = (rotacionClienteId: number) => {
        for (const semana of semanas) {
            for (const dia of DIAS) {
                if (
                    semana.dias[dia].some(c => c.rotacionClienteId === rotacionClienteId)
                ) {
                    return { semana: semana.semana, dia: DIAS.indexOf(dia) + 1 }
                }
            }
        }
        return undefined
    }

    const alSoltar = (evento: DragEndEvent) => {
        const mov = movimientoDeDrop(
            String(evento.active.id),
            evento.over ? String(evento.over.id) : null,
            origenDe,
        )
        if (mov) onMover(mov.rotacionClienteId, mov.semana, mov.dia)
    }

    return (
        <DndContext sensors={sensores} onDragEnd={alSoltar}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-4xl border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="w-40 text-left text-xs font-medium text-slate-500">
                                Semana
                            </th>
                            {DIAS.map(dia => (
                                <th
                                    key={dia}
                                    className="text-left text-xs font-semibold text-slate-600"
                                >
                                    {dia}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {semanas.map(semana => (
                            <tr key={semana.semana}>
                                <th className="align-top text-left">
                                    <span className="block text-sm font-semibold text-slate-900">
                                        Semana {semana.semana}
                                    </span>
                                    <span className="block text-xs font-normal">
                                        <DescripcionInline
                                            valor={semana.descripcion}
                                            placeholder="Sin zona"
                                            etiquetaAccesible={`Nombrar semana ${semana.semana}`}
                                            onGuardar={d => onRenombrarSemana(semana.semana, d)}
                                        />
                                    </span>
                                </th>
                                {DIAS.map(dia => (
                                    <Celda
                                        key={dia}
                                        semana={semana.semana}
                                        dia={dia}
                                        clientes={semana.dias[dia]}
                                        arrastrable={seEdita}
                                        intercambiable={seEdita}
                                        esOrigen={
                                            origen?.semana === semana.semana &&
                                            origen?.dia === DIAS.indexOf(dia) + 1
                                        }
                                        esDestinoPosible={
                                            origen !== null &&
                                            !(
                                                origen.semana === semana.semana &&
                                                origen.dia === DIAS.indexOf(dia) + 1
                                            )
                                        }
                                        onTocarIntercambio={tocarCelda}
                                        onQuitar={onQuitar}
                                        onRestaurar={onRestaurar}
                                        conVariasVisitas={conVariasVisitas}
                                        onAgregar={
                                            seEdita && onAgregar
                                                ? celda => onAgregar(celda.semana, celda.dia)
                                                : undefined
                                        }
                                    />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Va FUERA del div con `overflow-x-auto`: el overlay es `position: fixed`,
                pero un ancestro que recorta igual lo cortaría al arrastrar hacia el borde. */}
            <DragOverlay>
                <CardArrastrada semanas={semanas} />
            </DragOverlay>
        </DndContext>
    )
}
