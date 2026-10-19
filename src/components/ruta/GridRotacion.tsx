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
import { ChevronDown, ChevronRight } from 'lucide-react'
import ClienteCardRuta, { type TextoQuitar } from './ClienteCardRuta'
import DescripcionInline from './DescripcionInline'
import Pill from '@/components/ui/Pill'
import Segmentado, { type OpcionSegmentado } from '@/components/ui/Segmentado'
import { etiquetaEstadoSemana } from '@/lib/estadoSemana'
import type { Dia, IAgendaClientAdmin, ISemanaRotacionAdmin } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

type Tamano = 'normal' | 'compacta'

const OPCIONES_TAMANO: OpcionSegmentado<Tamano>[] = [
    { valor: 'normal', etiqueta: 'Normal', titulo: 'Cada card con su código y sus marcas' },
    { valor: 'compacta', etiqueta: 'Compacta', titulo: 'Cada card en una línea, solo el nombre' },
]

/** Preferencia de UI, no de la sesión: por eso no lleva el prefijo `visita-`. */
const CLAVE_COMPACTA = 'ruta-vista-compacta'

/** El storage puede tirar (modo privado, bloqueado): ahí se arranca con la vista normal. */
function leerCompacta(): boolean {
    try {
        return window.localStorage.getItem(CLAVE_COMPACTA) === '1'
    } catch {
        return false
    }
}

function guardarCompacta(compacta: boolean) {
    try {
        window.localStorage.setItem(CLAVE_COMPACTA, compacta ? '1' : '0')
    } catch {
        // Sin storage, la vista vale hasta recargar.
    }
}

/**
 * Qué semanas arrancan plegadas. En la vuelta se deja abierta la que importa —la en curso
 * o, si no hay, la primera pendiente— y se pliega el resto. Sin ninguna de las dos (una
 * vuelta cerrada, o un backend que no manda `estado`) no hay a cuál mirar primero, y se
 * despliega todo, como antes del plegado.
 */
export function semanasPlegadasIniciales(
    semanas: ISemanaRotacionAdmin[],
    plegarPorEstado: boolean,
): Set<number> {
    if (!plegarPorEstado) return new Set()
    const abierta =
        semanas.find(s => s.estado === 'en_curso') ?? semanas.find(s => s.estado === 'pendiente')
    if (!abierta) return new Set()
    return new Set(semanas.filter(s => s !== abierta).map(s => s.semana))
}

/** "LUN 6 · MAR 5 · …": los clientes vivos de cada día. Los quitados no se visitan. */
export function resumenPorDia(semana: ISemanaRotacionAdmin): string {
    return DIAS.map(dia => `${dia} ${semana.dias[dia].filter(c => !c.eliminado).length}`).join(
        ' · ',
    )
}

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
    textoQuitar?: TextoQuitar
    compacta: boolean
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
    textoQuitar,
    compacta,
}: CeldaProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `celda-${semana}-${dia}` })

    // El label lleva semana y día porque hay 25 celdas: sin eso, 25 botones con el mismo
    // nombre accesible son indistinguibles para un lector de pantalla y para los tests.
    const etiqueta = esOrigen
        ? 'Cancelar intercambio'
        : esDestinoPosible
          ? 'Intercambiar con este día'
          : 'Intercambiar este día'

    /**
     * Tooltips: `title` nativo, que es lo que ya usa esta pantalla para explicar sin
     * ocupar lugar (la autoría del movimiento en la card, el punto de "en curso" en la
     * cola). Explican el EFECTO, no el nombre del botón: "Intercambiar" ya está escrito
     * al lado, y lo que no se puede adivinar es que mueve TODOS los clientes de los dos
     * días de una sola vez.
     */
    const explicacionIntercambio = esOrigen
        ? 'Cancelar el intercambio. También sale con Escape.'
        : esDestinoPosible
          ? 'Permutar este día con el que quedó marcado: todos los clientes de uno pasan al otro, y al revés.'
          : 'Intercambiar este día completo con otro: tocá este y después el otro, y se permutan todos sus clientes.'

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
                            title={explicacionIntercambio}
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
                            {esOrigen
                                ? 'Cancelar'
                                : esDestinoPosible
                                  ? 'Intercambiar acá'
                                  : '⇄ Intercambiar'}
                        </button>
                    )}
                    {onAgregar && (
                        <button
                            type="button"
                            // El label lleva semana y día porque hay 25 celdas: sin eso,
                            // 25 botones con el mismo nombre accesible son
                            // indistinguibles para un lector de pantalla y para los tests.
                            aria-label={`Agregar cliente: semana ${semana}, ${dia}`}
                            title="Sumar un cliente a este día. Si ya tiene una visita en otra semana, se puede traer esa acá en vez de crear otra."
                            onClick={() => onAgregar({ semana, dia: DIAS.indexOf(dia) + 1 })}
                            className="shrink-0 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-500 hover:border-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        >
                            + cliente
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
                    textoQuitar={textoQuitar}
                    compacta={compacta}
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
function CardArrastrada({
    semanas,
    compacta,
}: {
    semanas: ISemanaRotacionAdmin[]
    compacta: boolean
}) {
    const { active } = useDndContext()
    const id = active ? parsearCard(String(active.id)) : null
    if (id === null) return null

    for (const semana of semanas) {
        for (const dia of DIAS) {
            const cliente = semana.dias[dia].find(c => c.rotacionClienteId === id)
            if (cliente) return <ClienteCardRuta cliente={cliente} overlay compacta={compacta} />
        }
    }
    return null
}

/** En qué está la semana: "En curso" la del ciclo abierto, "Hecha" las ya recorridas. */
function EtiquetaSemana({
    semana,
    className = 'mt-1',
}: {
    semana: ISemanaRotacionAdmin
    className?: string
}) {
    const etiqueta = etiquetaEstadoSemana(semana.estado, semana.fechaLunes)
    if (!etiqueta) return null
    return (
        <Pill tono={etiqueta.tono} className={className}>
            {etiqueta.texto}
        </Pill>
    )
}

/** El chevron que pliega o despliega una fila de semana. */
function BotonPlegar({
    semana,
    plegada,
    onTocar,
}: {
    semana: number
    plegada: boolean
    onTocar: (semana: number) => void
}) {
    return (
        <button
            type="button"
            aria-label={`${plegada ? 'Desplegar' : 'Plegar'} semana ${semana}`}
            aria-expanded={!plegada}
            onClick={() => onTocar(semana)}
            className="shrink-0 rounded p-0.5 text-tinta-2 hover:bg-superficie hover:text-tinta"
        >
            {plegada ? (
                <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
                <ChevronDown className="h-4 w-4" aria-hidden />
            )}
        </button>
    )
}

/**
 * El ⇅ del encabezado de una semana: mismo modo de dos toques que el ⇄ de los días, pero
 * permuta las dos filas enteras (clientes y nombre de zona).
 */
function BotonIntercambioSemana({
    semana,
    esOrigen,
    esDestinoPosible,
    onTocar,
}: {
    semana: number
    esOrigen: boolean
    esDestinoPosible: boolean
    onTocar: (semana: number) => void
}) {
    // Nombres distintos de los del ⇄ de días ("…este día…", "Cancelar intercambio: …"):
    // conviven en la misma pantalla y no se pueden confundir.
    const etiqueta = esOrigen
        ? 'Cancelar intercambio de semanas'
        : esDestinoPosible
          ? 'Intercambiar con esta semana'
          : 'Intercambiar esta semana'
    const explicacion = esOrigen
        ? 'Cancelar el intercambio. También sale con Escape.'
        : esDestinoPosible
          ? 'Permutar esta semana con la que quedó marcada: todos los clientes y el nombre de zona de una pasan a la otra, y al revés.'
          : 'Intercambiar esta semana completa con otra: tocá esta y después la otra, y se permutan sus clientes y su nombre de zona.'
    return (
        <button
            type="button"
            aria-label={`${etiqueta}: semana ${semana}`}
            title={explicacion}
            onClick={() => onTocar(semana)}
            className={`mt-1 block rounded border border-dashed px-1 py-0.5 text-[10px] font-medium ${
                esOrigen
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : esDestinoPosible
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600'
            }`}
        >
            {esOrigen ? 'Cancelar' : esDestinoPosible ? 'Intercambiar acá' : '⇅ Intercambiar'}
        </button>
    )
}

interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    /** Ausente = el nombre de la semana se muestra pero no se edita (la ruta base no tiene
     *  nombres propios: los toma de la última vuelta). */
    onRenombrarSemana?: (semana: number, descripcion: string | null) => void
    onIntercambiar: (a: Celda, b: Celda) => void
    /** Ausente = no se ofrece intercambiar semanas. */
    onIntercambiarSemanas?: (semanaA: number, semanaB: number) => void
    /** Qué semanas ofrecen el ⇅. Ausente = todas. En la vuelta, solo las pendientes: el
     *  backend rechaza las que están en curso o hechas. */
    semanaIntercambiable?: (semana: ISemanaRotacionAdmin) => boolean
    /** El texto del ✕ y su confirmación. Ausente = el de la vuelta. */
    textoQuitar?: TextoQuitar
    /** Ausente = no se ofrece quitar (rotación no editable). */
    onQuitar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece restaurar (rotación no editable). */
    onRestaurar?: (rotacionClienteId: number) => void
    /** Ausente = no se ofrece agregar clientes. Presente, se ofrece en toda celda de una
     *  rotación editable: el grid lo silencia solo si `editable` es false. */
    onAgregar?: (semana: number, dia: number) => void
    /** false = rotación cerrada: se ve pero no se toca. */
    editable?: boolean
    /** true = arranca desplegada solo la semana en curso (o la primera pendiente), como en
     *  la vuelta. Ausente = todas desplegadas, como en la ruta base. */
    plegarPorEstado?: boolean
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
    onIntercambiarSemanas,
    semanaIntercambiable,
    textoQuitar,
    onQuitar,
    onRestaurar,
    onAgregar,
    editable,
    plegarPorEstado = false,
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
    // Semana origen del ⇅ en curso. Un solo modo a la vez: armar uno desarma el otro, así
    // un toque nunca se lee como destino del intercambio equivocado.
    const [origenSemana, setOrigenSemana] = useState<number | null>(null)

    // Se calcula al montar y no se recalcula con cada refetch: un refetch no tiene que
    // desplegar lo que el usuario plegó. Cambiar de vendedor o de rotación remonta el grid
    // (la `key` de RutaPage), y ahí sí vuelve al default.
    const [plegadas, setPlegadas] = useState<Set<number>>(() =>
        semanasPlegadasIniciales(semanas, plegarPorEstado),
    )
    const [compacta, setCompacta] = useState(leerCompacta)

    const elegirTamano = (t: Tamano) => {
        setCompacta(t === 'compacta')
        guardarCompacta(t === 'compacta')
    }

    const tocarPlegar = (semana: number) => {
        const plegar = !plegadas.has(semana)
        // Una fila plegada no ofrece el ⇄: si el origen armado quedara adentro, el próximo
        // toque permutaría contra una celda que no se ve.
        if (plegar && origen?.semana === semana) setOrigen(null)
        setPlegadas(prev => {
            const nuevas = new Set(prev)
            if (plegar) nuevas.add(semana)
            else nuevas.delete(semana)
            return nuevas
        })
    }

    const plegarTodas = () => {
        setOrigen(null)
        setPlegadas(new Set(semanas.map(s => s.semana)))
    }

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
    const hayModo = origen !== null || origenSemana !== null
    useEffect(() => {
        if (!hayModo) return
        const alTecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOrigen(null)
                setOrigenSemana(null)
            }
        }
        window.addEventListener('keydown', alTecla)
        return () => window.removeEventListener('keydown', alTecla)
    }, [hayModo])

    const tocarSemana = (semana: number) => {
        setOrigen(null)
        if (origenSemana === null) {
            setOrigenSemana(semana)
            return
        }
        if (origenSemana !== semana) onIntercambiarSemanas?.(origenSemana, semana)
        setOrigenSemana(null) // tocar el origen de nuevo cancela
    }

    const tocarCelda = (celda: Celda) => {
        setOrigenSemana(null)
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
            {/* La barra del grid: menos scroll plegando semanas o achicando las cards. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={plegarTodas}
                    className="h-8 rounded-lg border border-linea bg-tarjeta px-2.5 text-[13px] text-tinta-2 hover:text-tinta"
                >
                    Plegar todas
                </button>
                <button
                    type="button"
                    onClick={() => setPlegadas(new Set())}
                    className="h-8 rounded-lg border border-linea bg-tarjeta px-2.5 text-[13px] text-tinta-2 hover:text-tinta"
                >
                    Desplegar todas
                </button>
                <span className="mx-1 h-5 w-px bg-linea" aria-hidden />
                <Segmentado
                    etiqueta="Tamaño de las cards"
                    opciones={OPCIONES_TAMANO}
                    valor={compacta ? 'compacta' : 'normal'}
                    onCambiar={elegirTamano}
                />
            </div>
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
                        {semanas.map(semana => {
                            const ofreceIntercambioSemana =
                                seEdita &&
                                onIntercambiarSemanas !== undefined &&
                                (semanaIntercambiable?.(semana) ?? true)
                            const botonIntercambioSemana = ofreceIntercambioSemana && (
                                <BotonIntercambioSemana
                                    semana={semana.semana}
                                    esOrigen={origenSemana === semana.semana}
                                    esDestinoPosible={
                                        origenSemana !== null && origenSemana !== semana.semana
                                    }
                                    onTocar={tocarSemana}
                                />
                            )

                            // Plegada: una línea, sin celdas. Sin celdas no hay drop, ni ⇄,
                            // ni "+ cliente"; el ⇅ sí, porque mueve la fila entera y no
                            // necesita ver sus clientes.
                            if (plegadas.has(semana.semana)) {
                                return (
                                    <tr key={semana.semana}>
                                        <td colSpan={DIAS.length + 1} className="rounded-md bg-white px-1.5 py-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <BotonPlegar
                                                    semana={semana.semana}
                                                    plegada
                                                    onTocar={tocarPlegar}
                                                />
                                                <span className="text-sm font-semibold text-slate-900">
                                                    Semana {semana.semana}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {semana.descripcion ?? 'Sin zona'}
                                                </span>
                                                <EtiquetaSemana semana={semana} className="" />
                                                <span className="text-xs tabular-nums text-slate-600">
                                                    {resumenPorDia(semana)}
                                                </span>
                                                {botonIntercambioSemana && (
                                                    <span className="ml-auto [&>button]:mt-0">
                                                        {botonIntercambioSemana}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            }

                            return (
                                <tr key={semana.semana}>
                                    <th className="align-top text-left">
                                        <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                                            <BotonPlegar
                                                semana={semana.semana}
                                                plegada={false}
                                                onTocar={tocarPlegar}
                                            />
                                            Semana {semana.semana}
                                        </span>
                                        {onRenombrarSemana ? (
                                            <span className="block text-xs font-normal">
                                                <DescripcionInline
                                                    valor={semana.descripcion}
                                                    placeholder="Sin zona"
                                                    etiquetaAccesible={`Nombrar semana ${semana.semana}`}
                                                    onGuardar={d => onRenombrarSemana(semana.semana, d)}
                                                />
                                            </span>
                                        ) : (
                                            <span className="block text-xs font-normal text-slate-500">
                                                {semana.descripcion ?? 'Sin zona'}
                                            </span>
                                        )}
                                        <EtiquetaSemana semana={semana} />
                                        {botonIntercambioSemana}
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
                                            textoQuitar={textoQuitar}
                                            compacta={compacta}
                                            conVariasVisitas={conVariasVisitas}
                                            onAgregar={
                                                seEdita && onAgregar
                                                    ? celda => onAgregar(celda.semana, celda.dia)
                                                    : undefined
                                            }
                                        />
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Va FUERA del div con `overflow-x-auto`: el overlay es `position: fixed`,
                pero un ancestro que recorta igual lo cortaría al arrastrar hacia el borde. */}
            <DragOverlay>
                <CardArrastrada semanas={semanas} compacta={compacta} />
            </DragOverlay>
        </DndContext>
    )
}
