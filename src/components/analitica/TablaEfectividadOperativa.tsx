import {
    AYUDA_EFECTIVIDAD_OPERATIVA,
    AYUDA_HORAS_MENSUAL,
    AYUDA_VISITAS_MENSUAL,
    META_HORAS_TEXTO,
    META_VISITAS_TEXTO,
} from './ayudaEfectividadOperativa'
import HelpPopover from './HelpPopover'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface TablaEfectividadOperativaProps {
    vendedores: IVendedorMetricas[]
    promedios: IVendedorMetricas
    onElegirVendedor: (codigo: string) => void
}

interface EncabezadoProps {
    titulo: string
    ayuda: React.ReactNode
    meta?: string
}

/** Encabezado con el nombre de la columna, su meta mensual (si aplica) visible
 *  debajo, y un botón de ayuda con la explicación completa. */
function Encabezado({ titulo, ayuda, meta }: EncabezadoProps) {
    return (
        <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1.5">
                {titulo}
                <HelpPopover label={`Qué significa ${titulo}`}>{ayuda}</HelpPopover>
            </span>
            {meta && <span className="text-[10px] normal-case tracking-normal text-slate-400">{meta}</span>}
        </div>
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
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado titulo="Efectividad operativa" ayuda={AYUDA_EFECTIVIDAD_OPERATIVA} />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado
                                titulo="Visitas (mensual)"
                                ayuda={AYUDA_VISITAS_MENSUAL}
                                meta={META_VISITAS_TEXTO}
                            />
                        </th>
                        <th className="px-3 py-2 text-right">
                            <Encabezado
                                titulo="Horas (mensual)"
                                ayuda={AYUDA_HORAS_MENSUAL}
                                meta={META_HORAS_TEXTO}
                            />
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
