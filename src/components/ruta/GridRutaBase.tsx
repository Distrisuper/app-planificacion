import { titleCaseNombre } from '@/lib/textFormat'
import type { Dia, ISemanaRutaBase } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/**
 * La ruta base del vendedor, de solo lectura: una fila por semana, cinco columnas de día,
 * igual que `GridRotacion` para poder comparar a ojo. Va aparte y no por `GridRotacion`
 * porque esa arrastra el estado de arrastre e intercambio, y acá no se edita nada.
 */
export default function GridRutaBase({ semanas }: { semanas: ISemanaRutaBase[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-4xl border-separate border-spacing-1">
                <thead>
                    <tr>
                        <th className="w-40 text-left text-xs font-medium text-slate-500">Semana</th>
                        {DIAS.map(dia => (
                            <th key={dia} className="text-left text-xs font-semibold text-slate-600">
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
                                <span className="block text-xs font-normal text-slate-500">
                                    {semana.descripcion ?? 'Sin zona'}
                                </span>
                            </th>
                            {DIAS.map(dia => (
                                <td
                                    key={dia}
                                    data-testid={`base-${semana.semana}-${dia}`}
                                    className="min-h-16 rounded-md bg-slate-50 p-1.5 align-top"
                                >
                                    <ul className="space-y-1">
                                        {semana.dias[dia].map(c => (
                                            <li
                                                key={c.codigoParticularCliente}
                                                className="rounded border border-linea bg-tarjeta px-2 py-1 text-xs text-tinta"
                                            >
                                                <span className="block truncate">
                                                    {titleCaseNombre(c.nombreCliente)}
                                                </span>
                                                <span className="text-[11px] text-tinta-2">
                                                    {c.codigoParticularCliente}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
