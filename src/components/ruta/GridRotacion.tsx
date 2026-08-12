import { useEffect, useState } from 'react'
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import ClienteCardRuta from './ClienteCardRuta'
import DescripcionInline from './DescripcionInline'
import type { Dia, IAgendaClientAdmin, ISemanaRotacionAdmin } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

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
            {intercambiable && (
                <button
                    type="button"
                    aria-label={`${etiqueta}: semana ${semana}, ${dia}`}
                    // `dia` acá es la clave ('LUN'), pero el estado del intercambio guarda
                    // el número (1..5) que viaja al backend — misma conversión que ya usa
                    // `parsearCelda`. Sin esto, la celda de origen nunca se reconoce a sí
                    // misma y todas las celdas se muestran como destino posible.
                    onClick={() =>
                        onTocarIntercambio({ semana, dia: DIAS.indexOf(dia) + 1 })
                    }
                    className={`mb-1 w-full rounded border border-dashed px-1 py-0.5 text-[10px] font-medium ${
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
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    arrastrable={arrastrable}
                />
            ))}
        </td>
    )
}

interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    onRenombrarSemana: (semana: number, descripcion: string | null) => void
    onIntercambiar: (a: Celda, b: Celda) => void
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
    editable,
}: GridRotacionProps) {
    // Celda origen del intercambio en curso. null = no hay intercambio empezado.
    const [origen, setOrigen] = useState<Celda | null>(null)

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
        <DndContext onDragEnd={alSoltar}>
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
                                        arrastrable={editable ?? true}
                                        intercambiable={editable ?? true}
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
                                    />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </DndContext>
    )
}
