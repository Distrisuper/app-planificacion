import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaEfectividadOperativaProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
}

/** Las tres columnas acordadas con gerencia — ver
 *  docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. Sin
 *  semáforo ni orden por columna: eso es propio de TablaVendedores. */
export default function TablaEfectividadOperativa({
    vendedores,
    promedios,
}: TablaEfectividadOperativaProps) {
    const renderFila = (v: IVendedorMetricas, esPromedio: boolean) => (
        <tr
            key={esPromedio ? 'promedios' : v.codigoParticularVendedor}
            className={esPromedio ? 'bg-slate-100 font-semibold text-slate-900' : 'border-b border-slate-100'}
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
                        <th className="px-3 py-2 text-right">Efectividad operativa</th>
                        <th className="px-3 py-2 text-right">Visitas (mensual)</th>
                        <th className="px-3 py-2 text-right">Horas (mensual)</th>
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
