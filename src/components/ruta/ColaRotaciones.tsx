import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DescripcionInline from './DescripcionInline'
import type { IRotacionResumen } from '@/types/planificacion'

interface ColaRotacionesProps {
    rotaciones: IRotacionResumen[]
    activaId: number | null
    onElegir: (rotacionId: number) => void
    onCrear: () => void
    onCancelar: (rotacionId: number) => void
    onRenombrarRotacion: (rotacionId: number, descripcion: string | null) => void
    onReordenar: (rotacionId: number, orden: number) => void
    creando: boolean
}

/** El nombre que le puso gerencia, o una etiqueta derivada del estado. */
export function etiquetaDe(rotacion: IRotacionResumen): string {
    if (rotacion.descripcion) return rotacion.descripcion
    if (rotacion.estado === 'abierta') return 'Actual'
    return `Programada #${rotacion.orden ?? '?'}`
}

/**
 * La cola de rotaciones del vendedor: la vigente y las programadas, en orden.
 *
 * La vigente no se puede cancelar (el vendedor está trabajando sobre ella) ni reordenar
 * (no está en la cola). Las programadas sí.
 */
export default function ColaRotaciones({
    rotaciones,
    activaId,
    onElegir,
    onCrear,
    onCancelar,
    onRenombrarRotacion,
    onReordenar,
    creando,
}: ColaRotacionesProps) {
    // Cancelar borra trabajo de planificación que puede haber llevado un rato, y el
    // backend no lo revierte: se confirma antes.
    const confirmarCancelar = (rotacion: IRotacionResumen) => {
        const ok = window.confirm(
            `¿Cancelar "${etiquetaDe(rotacion)}"? Se descarta su planificación.`,
        )
        if (ok) onCancelar(rotacion.id)
    }

    // Solo las programadas forman la cola: la vigente ya se está ejecutando y las
    // cerradas/canceladas no viajan en este payload.
    const programadas = rotaciones.filter(r => r.estado === 'programada')
    const ultimoOrden = programadas.length

    return (
        <div className="flex flex-wrap items-center gap-2">
            {rotaciones.map(rotacion => {
                const activa = rotacion.id === activaId
                return (
                    <span
                        key={rotacion.id}
                        className={`inline-flex items-center gap-1 rounded-full border pl-1 ${
                            activa
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onElegir(rotacion.id)}
                            className="rounded-full px-3 py-1 text-sm font-medium"
                        >
                            {etiquetaDe(rotacion)}
                        </button>

                        {/* La señal de estado va SEPARADA del nombre, y fuera del botón
                            (cambiarle el nombre accesible rompería a quien lo busque por
                            texto). `etiquetaDe` cae a "Actual"/"Programada #N" solo cuando no
                            hay descripción: al nombrar la rotación vigente se perdía el único
                            indicio de que está viva, y quedaba igual a una programada — justo
                            la que hay que tocar con cuidado porque el vendedor está encima. */}
                        {rotacion.estado === 'abierta' && (
                            <span
                                title="El vendedor está trabajando sobre esta rotación"
                                className={`mr-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                                    activa ? 'text-emerald-300' : 'text-emerald-700'
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="h-1.5 w-1.5 rounded-full bg-current"
                                />
                                en curso
                            </span>
                        )}

                        {/* Nombrarla también borraba el "#N", con lo que no se sabía qué lugar
                            ocupa en la cola. Solo cuando tiene nombre: sin él la etiqueta ya
                            dice "Programada #N" y repetirlo sería ruido. */}
                        {rotacion.estado === 'programada' && rotacion.descripcion && (
                            <span
                                title={`Posición ${rotacion.orden} en la cola`}
                                className={`text-[11px] font-medium ${
                                    activa ? 'text-slate-300' : 'text-slate-400'
                                }`}
                            >
                                {`#${rotacion.orden}`}
                            </span>
                        )}
                        {activa && rotacion.estado !== 'cerrada' && (
                            <span className="ml-1 mr-1 text-xs">
                                <DescripcionInline
                                    valor={rotacion.descripcion}
                                    placeholder="Sin nombre"
                                    etiquetaAccesible={`Nombrar ${etiquetaDe(rotacion)}`}
                                    onGuardar={d => onRenombrarRotacion(rotacion.id, d)}
                                    // Con nombre, el chip ya lo muestra como etiqueta: acá
                                    // solo va el lápiz. Sin nombre sí se muestra el
                                    // "Sin nombre", que es la única pista de que se puede
                                    // ponerle uno.
                                    mostrarValor={!rotacion.descripcion}
                                />
                            </span>
                        )}
                        {rotacion.estado === 'programada' && (
                            <>
                                <button
                                    type="button"
                                    aria-label={`Adelantar ${etiquetaDe(rotacion)}`}
                                    disabled={(rotacion.orden ?? 1) <= 1}
                                    onClick={() =>
                                        onReordenar(rotacion.id, (rotacion.orden ?? 1) - 1)
                                    }
                                    className={`rounded-full p-1 disabled:opacity-30 ${
                                        activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                    }`}
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Atrasar ${etiquetaDe(rotacion)}`}
                                    disabled={(rotacion.orden ?? 1) >= ultimoOrden}
                                    onClick={() =>
                                        onReordenar(rotacion.id, (rotacion.orden ?? 1) + 1)
                                    }
                                    className={`rounded-full p-1 disabled:opacity-30 ${
                                        activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                    }`}
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                        {rotacion.estado === 'programada' && (
                            <button
                                type="button"
                                aria-label={`Cancelar ${etiquetaDe(rotacion)}`}
                                onClick={() => confirmarCancelar(rotacion)}
                                className={`mr-1 rounded-full p-1 ${
                                    activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                }`}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </span>
                )
            })}

            <Button
                variant="outline"
                size="sm"
                aria-label="Agregar rotación"
                onClick={onCrear}
                disabled={creando}
            >
                <Plus className="mr-1 h-4 w-4" />
                {creando ? 'Agregando…' : 'Agregar rotación'}
            </Button>
        </div>
    )
}
