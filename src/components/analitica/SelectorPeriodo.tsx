import { ChevronLeft, ChevronRight } from 'lucide-react'
import { nombreMes, nombreSemana } from '@/lib/fechas'

export type ModoPeriodo = 'semana' | 'mes'

interface SelectorPeriodoProps {
    modo: ModoPeriodo
    fecha: Date
    onCambiarModo: (modo: ModoPeriodo) => void
    onCambiarFecha: (fecha: Date) => void
}

const DIAS_POR_PASO: Record<ModoPeriodo, number> = { semana: 7, mes: 0 }

/** Selector de rango para Efectividad operativa: alterna entre semana y mes.
 *  Cambiar de modo resetea la fecha a hoy — evita arrastrar, por ejemplo, un 31 de
 *  un mes largo a una semana que no existe en el mes corto. */
export default function SelectorPeriodo({
    modo,
    fecha,
    onCambiarModo,
    onCambiarFecha,
}: SelectorPeriodoProps) {
    const cambiarModo = (siguiente: ModoPeriodo) => {
        if (siguiente === modo) return
        onCambiarModo(siguiente)
        onCambiarFecha(new Date())
    }

    const avanzar = (delta: number) => {
        if (modo === 'mes') {
            onCambiarFecha(new Date(fecha.getFullYear(), fecha.getMonth() + delta, 1))
        } else {
            const siguiente = new Date(fecha)
            siguiente.setDate(fecha.getDate() + delta * DIAS_POR_PASO.semana)
            onCambiarFecha(siguiente)
        }
    }

    const etiqueta = modo === 'mes' ? 'mes' : 'semana'

    return (
        <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-slate-200 text-xs">
                <button
                    type="button"
                    onClick={() => cambiarModo('semana')}
                    className={`rounded-l-md px-2 py-1 ${
                        modo === 'semana' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    Semana
                </button>
                <button
                    type="button"
                    onClick={() => cambiarModo('mes')}
                    className={`rounded-r-md px-2 py-1 ${
                        modo === 'mes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    Mes
                </button>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={`${etiqueta === 'mes' ? 'Mes' : 'Semana'} anterior`}
                    onClick={() => avanzar(-1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
                    {modo === 'mes' ? nombreMes(fecha) : nombreSemana(fecha)}
                </span>
                <button
                    type="button"
                    aria-label={`${etiqueta === 'mes' ? 'Mes' : 'Semana'} siguiente`}
                    onClick={() => avanzar(1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
