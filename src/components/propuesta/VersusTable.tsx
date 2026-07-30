import type { IRubroEstado } from '@/types/planificacion'

interface VersusTableProps {
    rubros: IRubroEstado[]
}

const formatoPesos = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
})

/** Tabla Actual / Mes anterior / Prom. 6M por rubro — consulta rápida durante la visita,
 *  sin necesidad de interpretar barras. La celda Actual se resalta en rojo cuando está
 *  por debajo del promedio de 6 meses del propio rubro. */
export default function VersusTable({ rubros }: VersusTableProps) {
    return (
        <div className="overflow-hidden rounded-xl border border-dsline">
            <table className="w-full border-collapse text-[12.5px]">
                <thead>
                    <tr className="border-b border-dsline bg-[#F7F8FB] text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                        <th className="px-2.5 py-2 text-left">Rubro</th>
                        <th className="px-2 py-2 text-right">Actual</th>
                        <th className="px-2 py-2 text-right">M.Ant</th>
                        <th className="px-2.5 py-2 text-right">Prom.6M</th>
                    </tr>
                </thead>
                <tbody>
                    {rubros.map(r => {
                        const cae = r.promedio6m > 0 && r.actual < r.promedio6m
                        return (
                            <tr key={r.rubroCode} className="border-b border-dsline last:border-0">
                                <td className="max-w-[110px] truncate px-2.5 py-2.5 font-bold text-[#182645]">
                                    {r.nombre}
                                </td>
                                <td
                                    className={`px-2 py-2.5 text-right font-extrabold tabular-nums ${
                                        cae ? 'bg-[#FEECEC] text-dsred' : 'text-[#182645]'
                                    }`}
                                >
                                    {formatoPesos.format(r.actual)}
                                </td>
                                <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-[#3B4560]">
                                    {formatoPesos.format(r.mesAnterior)}
                                </td>
                                <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-[#3B4560]">
                                    {formatoPesos.format(r.promedio6m)}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
