import KpiTile from './KpiTile'
import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisEquipoProps {
    promedios: IVendedorMetricas
    cantidadVendedores: number
}

export default function KpisEquipo({ promedios, cantidadVendedores }: KpisEquipoProps) {
    const enCurso =
        promedios.ciclosEnCurso > 0 ? `⊙ ${promedios.ciclosEnCurso} ciclos en curso` : undefined
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile titulo="Cobertura del plan" valor={formatPct(promedios.cobertura)} nota={enCurso} />
            <KpiTile titulo="Efectividad comercial" valor={formatPct(promedios.efectividadComercial)} />
            <KpiTile titulo="Visitas válidas (prom.)" valor={formatNumero(promedios.visitasValidas)} />
            <KpiTile titulo="Vendedores" valor={String(cantidadVendedores)} />
        </div>
    )
}
