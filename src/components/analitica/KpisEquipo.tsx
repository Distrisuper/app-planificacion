import { formatNumero, formatPct } from '@/lib/analiticaFormat'
import type { IVendedorMetricas } from '@/types/analitica'

interface KpisEquipoProps {
    promedios: IVendedorMetricas
    cantidadVendedores: number
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}

export default function KpisEquipo({ promedios, cantidadVendedores }: KpisEquipoProps) {
    const enCurso =
        promedios.ciclosEnCurso > 0 ? `⊙ ${promedios.ciclosEnCurso} ciclos en curso` : undefined
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Cobertura del plan" valor={formatPct(promedios.cobertura)} nota={enCurso} />
            <Kpi titulo="Efectividad comercial" valor={formatPct(promedios.efectividadComercial)} />
            <Kpi titulo="Visitas válidas (prom.)" valor={formatNumero(promedios.visitasValidas)} />
            <Kpi titulo="Vendedores" valor={String(cantidadVendedores)} />
        </div>
    )
}
