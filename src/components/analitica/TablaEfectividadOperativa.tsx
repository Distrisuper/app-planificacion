import {
    AYUDA_EFECTIVIDAD_OPERATIVA,
    AYUDA_HORAS_MENSUAL,
    AYUDA_VISITAS_MENSUAL,
} from './ayudaEfectividadOperativa'
import HelpPopover from './HelpPopover'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaEfectividadOperativaProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
    onElegirVendedor: (codigo: string) => void
}

/** Título de columna + botón de ayuda. La meta mensual ya se muestra arriba, en
 *  KpisMensuales — repetirla acá sería redundante. */
function Encabezado({ titulo, ayuda }: { titulo: string; ayuda: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {titulo}
            <HelpPopover label={`Qué significa ${titulo}`}>{ayuda}</HelpPopover>
        </span>
    )
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
        // overflow-y visible (no "auto"): con solo overflow-x-auto, la fila con el
        // popover abierto ganaba un scrollbar vertical propio que le recortaba el panel.
        <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado titulo="Efectividad operativa" ayuda={AYUDA_EFECTIVIDAD_OPERATIVA} />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado titulo="Visitas (mensual)" ayuda={AYUDA_VISITAS_MENSUAL} />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado titulo="Horas (mensual)" ayuda={AYUDA_HORAS_MENSUAL} />
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
