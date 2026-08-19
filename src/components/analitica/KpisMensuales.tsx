import KpiTile from './KpiTile'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisMensualesProps {
    promedios: IVendedorMetricas
}

/** Los tres criterios acordados con gerencia para reemplazar al viejo dashboard de
 *  app-mobiliza: Efectividad operativa, Visitas y Horas, siempre en mes calendario
 *  completo. "Cobertura del plan" y "Efectividad comercial" quedan afuera por ahora
 *  — ver docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. */
export default function KpisMensuales({ promedios }: KpisMensualesProps) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile titulo="Efectividad operativa" valor={formatPctEscalado(promedios.efectividadOperativa)} />
            <KpiTile titulo="Visitas (mensual)" valor={formatNumero(promedios.visitasValidas)} />
            <KpiTile titulo="Horas (mensual)" valor={formatHoras(promedios.minutosTotales)} />
        </div>
    )
}
