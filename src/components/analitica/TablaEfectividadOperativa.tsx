import { Info } from 'lucide-react'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

const INFO_COLUMNA: Record<string, string> = {
    'Efectividad operativa':
        'Qué tan cerca estuvo del objetivo mensual de actividad: promedio entre % de la meta de clientes distintos visitados y % de la meta de horas trabajadas, cada uno topeado a 100%. No mide resultado comercial, sino actividad.',
    'Visitas (mensual)':
        'Visitas del mes con GPS confirmado (dentro de 300 m del cliente). Las que no pasan esa validación no cuentan acá.',
    'Horas (mensual)': 'Horas totales dedicadas a esas mismas visitas válidas.',
}

/** Encabezado con tooltip nativo (title) sobre un ícono de ayuda, marcado
 *  aria-hidden para no alterar el nombre accesible de la columna. */
function EncabezadoConInfo({ titulo }: { titulo: string }) {
    return (
        <span className="inline-flex items-center justify-end gap-1">
            {titulo}
            <span title={INFO_COLUMNA[titulo]}>
                <Info className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
            </span>
        </span>
    )
}

interface TablaEfectividadOperativaProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
    onElegirVendedor: (codigo: string) => void
}

/** Las tres columnas acordadas con gerencia — ver
 *  docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. Sin
 *  semáforo ni orden por columna: eso es lo que distinguía a la vieja TablaVendedores. */
export default function TablaEfectividadOperativa({
    vendedores,
    promedios,
    onElegirVendedor,
}: TablaEfectividadOperativaProps) {
    const renderFila = (v: IVendedorMetricas, esPromedio: boolean) => (
        <tr
            key={esPromedio ? 'promedios' : v.codigoParticularVendedor}
            className={
                esPromedio
                    ? 'bg-slate-100 font-semibold text-slate-900'
                    : 'cursor-pointer border-b border-slate-100 hover:bg-blue-50'
            }
            onClick={esPromedio ? undefined : () => onElegirVendedor(v.codigoParticularVendedor)}
        >
            <td className="px-3 py-2 text-left">{v.nombreVendedor}</td>
            <td className="px-3 py-2 text-right">{formatPctEscalado(v.efectividadOperativa)}</td>
            <td className="px-3 py-2 text-right">{formatNumero(v.visitasValidas)}</td>
            <td className="px-3 py-2 text-right">{formatHoras(v.minutosTotales)}</td>
        </tr>
    )

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-right">
                            <EncabezadoConInfo titulo="Efectividad operativa" />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <EncabezadoConInfo titulo="Visitas (mensual)" />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <EncabezadoConInfo titulo="Horas (mensual)" />
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {renderFila(promedios, true)}
                    {vendedores.map(v => renderFila(v, false))}
                </tbody>
            </table>
        </div>
    )
}
