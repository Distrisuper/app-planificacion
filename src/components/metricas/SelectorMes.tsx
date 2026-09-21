import { mesActual, mesAnterior } from '@/lib/metricas/mes'

interface Props { mes: string; onCambiar: (mes: string) => void }

/** Dos opciones a propósito (spec): mes calendario, los objetivos son mensuales. */
export default function SelectorMes({ mes, onCambiar }: Props) {
    const actual = mesActual()
    const opciones = [
        { label: 'Este mes', valor: actual },
        { label: 'Mes anterior', valor: mesAnterior(actual) },
    ]
    return (
        <div className="flex gap-2 px-4 pt-3" role="group" aria-label="Período">
            {opciones.map(o => {
                const activo = o.valor === mes
                return (
                    <button key={o.valor} type="button" aria-pressed={activo} onClick={() => onCambiar(o.valor)}
                        className={`h-8 rounded-full px-3.5 text-[12px] font-bold ${activo ? 'bg-dsnavy text-white' : 'bg-white text-dsnavy shadow-[0_1px_2px_rgba(24,38,69,.06)]'}`}>
                        {o.label}
                    </button>
                )
            })}
        </div>
    )
}
