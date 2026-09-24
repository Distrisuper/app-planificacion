import { useState } from 'react'
import { formatHoras, formatNumero, formatPct } from '@/lib/analiticaFormat'
import { claseCumplimiento, cumplimiento, factorProyeccion, proyectar, razon } from '@/lib/metricas'
import type { IMetricasFila, IMetricasResumen } from '@/types/metricas'

type Clave = 'nombre' | 'cartera' | 'visitados' | 'conCompra' | 'tasaCierre' | 'horas' | 'planner'

const valor = (f: IMetricasFila, k: Clave): number | string | null => {
    switch (k) {
        case 'nombre': return f.nombreVendedor
        case 'cartera': return f.cartera
        case 'visitados': return f.clientesVisitados
        case 'conCompra': return f.clientesConCompra
        case 'tasaCierre': return razon(f.visitadosConCompra, f.clientesVisitados)
        case 'horas': return f.minutosTotales
        case 'planner': return razon(f.planificadosConCompra, f.planificados)
    }
}

const COLUMNAS: { clave: Clave; titulo: string }[] = [
    { clave: 'nombre', titulo: 'Vendedor' },
    { clave: 'cartera', titulo: 'Clientes totales' },
    { clave: 'visitados', titulo: 'Clientes visitados' },
    { clave: 'conCompra', titulo: 'Clientes con compra' },
    { clave: 'tasaCierre', titulo: 'Tasa de cierre' },
    { clave: 'horas', titulo: 'Horas vs objetivo' },
    { clave: 'planner', titulo: 'Ventas vs Planner' },
]

function Celda({ principal, secundario, pct }: { principal: string; secundario?: string; pct?: number | null }) {
    return (
        <td className="px-3 py-2 text-right tabular-nums">
            <span className="text-slate-900">{principal}</span>
            {secundario && <span className="text-slate-400"> / {secundario}</span>}
            {pct !== undefined && <span className={`block text-xs ${claseCumplimiento(pct)}`}>{formatPct(pct)}</span>}
        </td>
    )
}

interface RankingVendedoresProps {
    resumen: IMetricasResumen
    proyectado: boolean
    vendedorElegido?: string
    onElegir: (codigo: string) => void
}

export default function RankingVendedores({ resumen, proyectado, vendedorElegido, onElegir }: RankingVendedoresProps) {
    const [clave, setClave] = useState<Clave | null>(null)
    const [dir, setDir] = useState<'asc' | 'desc'>('desc')

    const factor = factorProyeccion(resumen.diasHabiles, resumen.diasHabilesTranscurridos)
    const ajustar = (f: IMetricasFila) => (proyectado ? proyectar(f, factor) : f)
    const equipo = ajustar(resumen.equipo)
    const filas = resumen.vendedores.map(ajustar)

    if (clave) {
        const s = dir === 'desc' ? -1 : 1
        filas.sort((a, b) => {
            const va = valor(a, clave)
            const vb = valor(b, clave)
            if (va === null && vb === null) return 0
            if (va === null) return 1
            if (vb === null) return -1
            return typeof va === 'string' ? va.localeCompare(String(vb), 'es') * s : ((va as number) - (vb as number)) * s
        })
    }

    const tocar = (k: Clave) => {
        setDir(clave === k && dir === 'desc' ? 'asc' : 'desc')
        setClave(k)
    }

    const renderFila = (f: IMetricasFila, esEquipo: boolean) => (
        <tr
            key={esEquipo ? 'equipo' : f.codigoVendedor}
            onClick={esEquipo ? undefined : () => onElegir(f.codigoVendedor)}
            className={
                esEquipo
                    ? 'bg-slate-100 font-semibold'
                    : `cursor-pointer border-b border-slate-100 hover:bg-blue-50 ${f.codigoVendedor === vendedorElegido ? 'bg-blue-50' : ''}`
            }
        >
            <td className="px-3 py-2 text-left text-slate-900">{f.nombreVendedor}</td>
            <Celda principal={formatNumero(f.cartera)} />
            <Celda principal={formatNumero(f.clientesVisitados)} pct={razon(f.clientesVisitados, f.cartera)} />
            <Celda principal={formatNumero(f.clientesConCompra)} pct={razon(f.clientesConCompra, f.cartera)} />
            <Celda principal={formatPct(razon(f.visitadosConCompra, f.clientesVisitados))} />
            <Celda
                principal={formatHoras(f.minutosTotales)}
                secundario={formatHoras(f.objetivoMinutos)}
                pct={cumplimiento(f.minutosTotales, f.objetivoMinutos)}
            />
            <Celda
                principal={formatNumero(f.planificadosConCompra)}
                secundario={formatNumero(f.planificados)}
                pct={razon(f.planificadosConCompra, f.planificados)}
            />
        </tr>
    )

    return (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
                <h2 className="text-sm font-semibold text-slate-900">Ranking por vendedor</h2>
                <p className="mt-0.5 text-xs text-slate-500">Tocá una columna para ordenar; tocá una fila para ver ese vendedor arriba.</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            {COLUMNAS.map(c => (
                                <th key={c.clave} className={`px-3 py-2 ${c.clave === 'nombre' ? 'text-left' : 'text-right'}`}>
                                    <button type="button" onClick={() => tocar(c.clave)} className="uppercase hover:text-slate-900">
                                        {c.titulo}{clave === c.clave ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {renderFila(equipo, true)}
                        {filas.map(f => renderFila(f, false))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
