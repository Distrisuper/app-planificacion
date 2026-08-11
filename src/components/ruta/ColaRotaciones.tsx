import { Plus, X } from 'lucide-react'
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
                        {activa && rotacion.estado !== 'cerrada' && (
                            <span className="ml-1 mr-1 text-xs">
                                <DescripcionInline
                                    valor={rotacion.descripcion}
                                    placeholder="Sin nombre"
                                    etiquetaAccesible={`Nombrar ${etiquetaDe(rotacion)}`}
                                    onGuardar={d => onRenombrarRotacion(rotacion.id, d)}
                                />
                            </span>
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
