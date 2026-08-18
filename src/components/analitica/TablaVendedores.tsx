import { useMemo, useState } from 'react'
import { ArrowUpDown, Clock } from 'lucide-react'
import {
    alertasAbsolutas,
    esBajoPromedio,
    formatDuracion,
    formatNumero,
    formatPct,
    formatPctEscalado,
} from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaVendedoresProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
    onElegirVendedor: (codigo: string) => void
}

type Columna = {
    clave: keyof IVendedorMetricas
    titulo: string
    /** Cómo se pinta el valor. 'relativo' compara contra el promedio del equipo. */
    render: (v: IVendedorMetricas) => string
    comparar: boolean
}

const COLUMNAS: Columna[] = [
    { clave: 'cobertura', titulo: 'Cobertura', render: v => formatPct(v.cobertura), comparar: true },
    { clave: 'planificados', titulo: 'Plan', render: v => formatNumero(v.planificados), comparar: false },
    { clave: 'visitados', titulo: 'Visitados', render: v => formatNumero(v.visitados), comparar: true },
    { clave: 'pendientes', titulo: 'Pend.', render: v => formatNumero(v.pendientes), comparar: false },
    { clave: 'enCurso', titulo: 'En curso', render: v => formatNumero(v.enCurso), comparar: false },
    { clave: 'visitasPorDia', titulo: 'Visitas/día', render: v => formatNumero(v.visitasPorDia), comparar: true },
    { clave: 'clientesDistintos', titulo: 'Clientes', render: v => formatNumero(v.clientesDistintos), comparar: true },
    {
        clave: 'efectividadComercial',
        titulo: 'Efect. comercial',
        render: v => formatPct(v.efectividadComercial),
        comparar: true,
    },
    { clave: 'pctNoOfrecidos', titulo: 'No ofrecidos', render: v => formatPct(v.pctNoOfrecidos), comparar: false },
    {
        clave: 'efectividadOperativa',
        titulo: 'Cumplimiento',
        render: v => formatPctEscalado(v.efectividadOperativa),
        comparar: true,
    },
]

export default function TablaVendedores({
    vendedores,
    promedios,
    onElegirVendedor,
}: TablaVendedoresProps) {
    const [orden, setOrden] = useState<{ clave: keyof IVendedorMetricas; asc: boolean } | null>(null)

    const ordenados = useMemo(() => {
        if (!orden) return vendedores
        const copia = [...vendedores]
        copia.sort((a, b) => {
            const va = a[orden.clave]
            const vb = b[orden.clave]
            // Los null van al final en ambos sentidos: son ausencia de dato, no un mínimo.
            if (va === null) return 1
            if (vb === null) return -1
            if (typeof va === 'number' && typeof vb === 'number') return orden.asc ? va - vb : vb - va
            return String(va).localeCompare(String(vb)) * (orden.asc ? 1 : -1)
        })
        return copia
    }, [vendedores, orden])

    const alternarOrden = (clave: keyof IVendedorMetricas) =>
        setOrden(actual =>
            actual?.clave === clave ? { clave, asc: !actual.asc } : { clave, asc: true },
        )

    const filaClase = (v: IVendedorMetricas, col: Columna): string => {
        if (!col.comparar) return 'text-slate-700'
        const valor = v[col.clave]
        const prom = promedios[col.clave]
        const bajo =
            typeof valor === 'number' || valor === null
                ? esBajoPromedio(valor as number | null, prom as number | null)
                : false
        return bajo ? 'text-red-600 font-semibold' : 'text-slate-700'
    }

    const renderFila = (v: IVendedorMetricas, esPromedio: boolean) => {
        const alertas = alertasAbsolutas(v)
        return (
            <tr
                key={esPromedio ? 'promedios' : v.codigoParticularVendedor}
                className={
                    esPromedio
                        ? 'bg-slate-100 font-semibold text-slate-900'
                        : 'cursor-pointer border-b border-slate-100 hover:bg-blue-50'
                }
                onClick={
                    esPromedio ? undefined : () => onElegirVendedor(v.codigoParticularVendedor)
                }
            >
                <td className="px-3 py-2 text-left">
                    <span className="flex items-center gap-1.5">
                        {v.nombreVendedor}
                        {v.ciclosEnCurso > 0 && !esPromedio && (
                            <span title="ciclo en curso: la cobertura es parcial">
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                        )}
                    </span>
                </td>
                {COLUMNAS.map(col => (
                    <td
                        key={col.clave}
                        data-testid={esPromedio ? undefined : `celda-${col.clave}-${v.codigoParticularVendedor}`}
                        className={`px-3 py-2 text-right ${filaClase(v, col)}`}
                    >
                        {col.render(v)}
                    </td>
                ))}
                <td
                    data-testid={esPromedio ? undefined : 'celda-no-validadas'}
                    className={`px-3 py-2 text-right ${
                        alertas.includes('geo') ? 'text-red-600 font-semibold' : 'text-slate-700'
                    }`}
                >
                    {formatNumero(v.visitasNoValidadas)}
                </td>
                <td
                    className={`px-3 py-2 text-right ${
                        alertas.includes('duracion') ? 'text-red-600 font-semibold' : 'text-slate-700'
                    }`}
                >
                    {formatDuracion(v.duracionPromedioMin)}
                </td>
            </tr>
        )
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        {COLUMNAS.map(col => (
                            <th key={col.clave} className="px-3 py-2 text-right">
                                <button
                                    type="button"
                                    onClick={() => alternarOrden(col.clave)}
                                    className="inline-flex items-center gap-1 hover:text-slate-900"
                                >
                                    {col.titulo}
                                    <ArrowUpDown className="h-3 w-3" />
                                </button>
                            </th>
                        ))}
                        <th className="px-3 py-2 text-right">
                            <button
                                type="button"
                                onClick={() => alternarOrden('visitasNoValidadas')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                            >
                                No val.
                                <ArrowUpDown className="h-3 w-3" />
                            </button>
                        </th>
                        <th className="px-3 py-2 text-right">
                            <button
                                type="button"
                                onClick={() => alternarOrden('duracionPromedioMin')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                            >
                                Duración
                                <ArrowUpDown className="h-3 w-3" />
                            </button>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {renderFila(promedios, true)}
                    {ordenados.map(v => renderFila(v, false))}
                </tbody>
            </table>
        </div>
    )
}
