import { ChevronLeft, ChevronRight } from 'lucide-react'
import { nombreMes, nombreSemana } from '@/lib/fechas'

export type ModoPeriodo = 'semana' | 'mes' | 'rango'

interface SelectorPeriodoProps {
    modo: ModoPeriodo
    fecha: Date
    onCambiarModo: (modo: ModoPeriodo) => void
    onCambiarFecha: (fecha: Date) => void
    /** Suma un tercer modo, "Rango de fechas", con dos inputs de fecha. Sin esto el
     *  selector se comporta exactamente como antes (semana / mes). */
    conRango?: boolean
    rango?: { desde: string; hasta: string }
    onCambiarRango?: (r: { desde: string; hasta: string }) => void
}

const DIAS_POR_PASO: Record<Exclude<ModoPeriodo, 'rango'>, number> = { semana: 7, mes: 0 }

/** Selector de rango para Efectividad: alterna entre semana y mes.
 *  Cambiar de modo resetea la fecha a hoy — evita arrastrar, por ejemplo, un 31 de
 *  un mes largo a una semana que no existe en el mes corto. */
export default function SelectorPeriodo({
    modo,
    fecha,
    onCambiarModo,
    onCambiarFecha,
    conRango,
    rango,
    onCambiarRango,
}: SelectorPeriodoProps) {
    const cambiarModo = (siguiente: ModoPeriodo) => {
        if (siguiente === modo) return
        onCambiarModo(siguiente)
        onCambiarFecha(new Date())
    }

    const avanzar = (delta: number) => {
        if (modo === 'rango') return
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
                    className={`${conRango ? '' : 'rounded-r-md'} px-2 py-1 ${
                        modo === 'mes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    Mes
                </button>
                {conRango && (
                    <button
                        type="button"
                        onClick={() => cambiarModo('rango')}
                        className={`rounded-r-md px-2 py-1 ${
                            modo === 'rango' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        Rango de fechas
                    </button>
                )}
            </div>
            {modo === 'rango' && rango ? (
                <div className="flex items-center gap-2 text-sm">
                    <label className="flex items-center gap-1 text-slate-600">
                        Desde
                        <input
                            type="date"
                            aria-label="Desde"
                            value={rango.desde}
                            max={rango.hasta}
                            onChange={e => e.target.value && onCambiarRango?.({ ...rango, desde: e.target.value })}
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                        />
                    </label>
                    <label className="flex items-center gap-1 text-slate-600">
                        Hasta
                        <input
                            type="date"
                            aria-label="Hasta"
                            value={rango.hasta}
                            min={rango.desde}
                            onChange={e => e.target.value && onCambiarRango?.({ ...rango, hasta: e.target.value })}
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                        />
                    </label>
                </div>
            ) : (
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
            )}
        </div>
    )
}
