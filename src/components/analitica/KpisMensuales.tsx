import {
    AYUDA_HORAS_MENSUAL,
    AYUDA_VISITAS_MENSUAL,
    META_HORAS_TEXTO,
    META_VISITAS_TEXTO,
    ayudaEfectividad,
} from './ayudaEfectividadOperativa'
import KpiTile from './KpiTile'
import { formatHoras, formatNumero, formatPctEscalado } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisMensualesProps {
    promedios: IVendedorMetricas
}

/** Los tres criterios acordados con gerencia para reemplazar al viejo dashboard de
 *  app-mobiliza: Efectividad, Visitas y Horas, siempre en mes calendario
 *  completo. "Cobertura del plan" y "Efectividad comercial" quedan afuera por ahora
 *  — ver docs/superpowers/specs/2026-08-18-efectividad-operativa-kpi-design.md. */
export default function KpisMensuales({ promedios }: KpisMensualesProps) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile
                titulo="Efectividad"
                valor={formatPctEscalado(promedios.efectividadOperativa)}
                ayuda={ayudaEfectividad(promedios)}
            />
            <KpiTile
                titulo="Visitas (mensual)"
                valor={formatNumero(promedios.visitasValidas)}
                meta={META_VISITAS_TEXTO}
                ayuda={AYUDA_VISITAS_MENSUAL}
            />
            <KpiTile
                titulo="Horas (mensual)"
                valor={formatHoras(promedios.minutosTotales)}
                meta={META_HORAS_TEXTO}
                ayuda={AYUDA_HORAS_MENSUAL}
            />
        </div>
    )
}
