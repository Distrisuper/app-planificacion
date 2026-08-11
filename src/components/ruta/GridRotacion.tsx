import ClienteCardRuta from './ClienteCardRuta'
import type { Dia, ISemanaRotacionAdmin } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
}

/**
 * El plan completo de una rotación: una fila por semana, cinco columnas de día.
 *
 * Las semanas salen del payload tal como vienen —incluidas las vacías— porque el backend
 * las deriva del SET de la rotación (`pl_rotacion_semana`) y no de los clientes. Una
 * semana sin clientes sigue siendo un destino válido para arrastrar una card.
 */
export default function GridRotacion({ semanas }: GridRotacionProps) {
    return (
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
                                {semana.descripcion && (
                                    <span className="block text-xs font-normal text-slate-500">
                                        {semana.descripcion}
                                    </span>
                                )}
                            </th>
                            {DIAS.map(dia => (
                                <td
                                    key={dia}
                                    data-testid={`celda-${semana.semana}-${dia}`}
                                    className="min-w-40 space-y-1 rounded-md bg-white p-1.5 align-top"
                                >
                                    {semana.dias[dia].map(cliente => (
                                        <ClienteCardRuta
                                            key={cliente.rotacionClienteId}
                                            cliente={cliente}
                                        />
                                    ))}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
