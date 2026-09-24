import Paginador from './Paginador'
import { formatPct } from '@/lib/analiticaFormat'
import type { IClienteObjecion, IConteo, IObjecionDetalle } from '@/types/metricas'

const COLUMNAS: { clave: keyof IClienteObjecion; titulo: string }[] = [
    { clave: 'nombre', titulo: 'Cliente' },
    { clave: 'direccion', titulo: 'Dirección' },
    { clave: 'telefono', titulo: 'Teléfono' },
    { clave: 'localidad', titulo: 'Localidad' },
    { clave: 'vendedor', titulo: 'Vendedor' },
]

function Mix({ titulo, items }: { titulo: string; items: IConteo[] }) {
    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            {items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">s/d</p>
            ) : (
                <ul className="mt-2 space-y-1">
                    {items.map(i => (
                        <li key={i.descripcion} className="flex justify-between text-sm">
                            <span className="text-slate-800">{i.descripcion}</span>
                            <span className="tabular-nums text-slate-500">{i.cantidad} · {formatPct(i.pct)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

interface DetalleObjecionProps {
    detalle: IObjecionDetalle
    orden: keyof IClienteObjecion
    dir: 'asc' | 'desc'
    onOrdenar: (clave: keyof IClienteObjecion) => void
    onPagina: (p: number) => void
}

export default function DetalleObjecion({ detalle, orden, dir, onOrdenar, onPagina }: DetalleObjecionProps) {
    return (
        <div data-testid="detalle-objecion" className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-900">
                Objeción “{detalle.descripcion}” · {detalle.clientes.total} clientes
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Mix titulo="Marcas que más se repiten" items={detalle.marcas} />
                <Mix titulo="Rubros que más se repiten" items={detalle.rubros} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className="px-3 py-2 text-left">
                                    <button type="button" onClick={() => onOrdenar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{orden === c.clave ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {detalle.clientes.filas.map(cl => (
                            <tr key={cl.codigo} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-900">{cl.nombre}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.direccion ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.telefono ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.localidad ?? 's/d'}</td>
                                <td className="px-3 py-2 text-slate-600">{cl.vendedor}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Paginador pagina={detalle.clientes.pagina} total={detalle.clientes.total} cant={detalle.clientes.cant} onCambiar={onPagina} />
        </div>
    )
}
