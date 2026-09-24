import Paginador from './Paginador'
import { formatMillones } from '@/lib/metricas'
import type { IClienteTramo, IClientesDeTramo } from '@/types/metricas'

const COLUMNAS: { clave: keyof IClienteTramo; titulo: string; derecha?: boolean }[] = [
    { clave: 'nombre', titulo: 'Cliente' },
    { clave: 'actual', titulo: 'Facturación actual ($M)', derecha: true },
    { clave: 'promedio6m', titulo: 'Prom. últimos 6 meses ($M)', derecha: true },
    { clave: 'variacion', titulo: 'Vs. promedio', derecha: true },
]

interface ClientesDeTramoProps {
    datos: IClientesDeTramo
    orden: keyof IClienteTramo
    dir: 'asc' | 'desc'
    onOrdenar: (clave: keyof IClienteTramo) => void
    onPagina: (p: number) => void
}

export default function ClientesDeTramo({ datos, orden, dir, onOrdenar, onPagina }: ClientesDeTramoProps) {
    return (
        <div data-testid="clientes-tramo" className="space-y-2 border-t border-slate-200 pt-4">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className={`px-3 py-2 ${c.derecha ? 'text-right' : 'text-left'}`}>
                                    <button type="button" onClick={() => onOrdenar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{orden === c.clave ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {datos.filas.map(cl => (
                            <tr key={cl.codigo} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-900">{cl.nombre}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMillones(cl.actual)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMillones(cl.promedio6m)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${
                                    cl.variacion === null ? 'text-slate-400' : cl.variacion >= 0 ? 'text-emerald-600' : 'text-red-600'
                                }`}>
                                    {cl.variacion === null ? 's/d' : `${cl.variacion >= 0 ? '+' : ''}${Math.round(cl.variacion * 100)}%`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">{datos.total} clientes en esta categoría</p>
            <Paginador pagina={datos.pagina} total={datos.total} cant={datos.cant} onCambiar={onPagina} />
        </div>
    )
}
