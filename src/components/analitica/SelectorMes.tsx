import { ChevronLeft, ChevronRight } from 'lucide-react'
import { nombreMes } from '@/lib/fechas'

interface SelectorMesProps {
    mes: Date
    onCambiarMes: (mes: Date) => void
}

export default function SelectorMes({ mes, onCambiarMes }: SelectorMesProps) {
    const cambiar = (delta: number) => onCambiarMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => cambiar(-1)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
                {nombreMes(mes)}
            </span>
            <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => cambiar(1)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    )
}
