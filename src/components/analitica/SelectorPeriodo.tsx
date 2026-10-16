import { ChevronLeft, ChevronRight } from 'lucide-react'
import { diaHabilVecino, nombreDia, nombreMes, nombreSemana } from '@/lib/fechas'

export type ModoPeriodo = 'dia' | 'semana' | 'mes'

interface SelectorPeriodoProps {
    modo: ModoPeriodo
    fecha: Date
    onCambiarModo: (modo: ModoPeriodo) => void
    onCambiarFecha: (fecha: Date) => void
}

const MODOS: { valor: ModoPeriodo; etiqueta: string }[] = [
    { valor: 'dia', etiqueta: 'Día' },
    { valor: 'semana', etiqueta: 'Semana' },
    { valor: 'mes', etiqueta: 'Mes' },
]

/** Selector de rango: día, semana o mes.
 *  Cambiar de modo resetea la fecha a hoy — evita arrastrar, por ejemplo, un 31 de
 *  un mes largo a una semana que no existe en el mes corto. El día salta los fines de
 *  semana (sin objetivo). */
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

    const avanzar = (delta: 1 | -1) => {
        if (modo === 'mes') {
            onCambiarFecha(new Date(fecha.getFullYear(), fecha.getMonth() + delta, 1))
        } else if (modo === 'dia') {
            onCambiarFecha(diaHabilVecino(fecha, delta))
        } else {
            const siguiente = new Date(fecha)
            siguiente.setDate(fecha.getDate() + delta * 7)
            onCambiarFecha(siguiente)
        }
    }

    const etiqueta = MODOS.find(m => m.valor === modo)!.etiqueta
    const nombre = modo === 'mes' ? nombreMes(fecha) : modo === 'dia' ? nombreDia(fecha) : nombreSemana(fecha)

    return (
        <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-slate-200 text-xs">
                {MODOS.map(m => (
                    <button
                        key={m.valor}
                        type="button"
                        onClick={() => cambiarModo(m.valor)}
                        className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${
                            modo === m.valor ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        {m.etiqueta}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={`${etiqueta} anterior`}
                    onClick={() => avanzar(-1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">{nombre}</span>
                <button
                    type="button"
                    aria-label={`${etiqueta} siguiente`}
                    onClick={() => avanzar(1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
