import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import PanelMetricas, { type DetalleArgs } from '@/components/metricas/PanelMetricas'
import SelectorMes from '@/components/metricas/SelectorMes'
import DetalleClientesSheet from '@/components/metricas/DetalleClientesSheet'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { mesActual } from '@/lib/metricas/mes'

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Pestaña "Métricas" de gerencia: el mismo PanelMetricas del vendedor, con el sujeto
 *  elegido por chips (Equipo o un vendedor del scope). Ranking NO entra (fuera de alcance). */
export default function AnaliticaMetricasPage() {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()
    const [params, setParams] = useSearchParams()
    const { data: roster } = useVendedores()
    const [detalle, setDetalle] = useState<DetalleArgs | null>(null)

    const vendedor = params.get('vendedor') || 'equipo'
    const mesParam = params.get('mes')
    const mes = mesParam && MES_RE.test(mesParam) ? mesParam : mesActual()

    const set = (k: 'vendedor' | 'mes', v: string) =>
        setParams(p => { p.set(k, v); return p }, { replace: true })

    const chips = [{ codigo: 'equipo', nombre: 'Equipo' }, ...(roster ?? []).map(v => ({ codigo: v.codigoParticularVendedor, nombre: v.nombreVendedor }))]

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1"><AnaliticaTabs /></div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>
            <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Vendedor">
                    {chips.map(c => {
                        const activo = c.codigo === vendedor
                        return (
                            <button key={c.codigo} type="button" aria-pressed={activo} onClick={() => set('vendedor', c.codigo)}
                                className={`h-8 shrink-0 rounded-full border px-3.5 text-[12px] font-bold ${activo ? 'border-dsnavy bg-dsnavy text-white' : 'border-slate-200 bg-white text-dsnavy hover:bg-dsnavy/5'}`}>
                                {c.nombre}
                            </button>
                        )
                    })}
                </div>
                <div className="-mx-4"><SelectorMes mes={mes} onCambiar={m => set('mes', m)} /></div>
                <div className="-mx-4 rounded-lg">
                    <PanelMetricas mes={mes} vendedor={vendedor} propio={false} columnas={4} onDetalle={setDetalle} />
                </div>
            </main>
            <DetalleClientesSheet detalle={detalle} mes={mes} vendedor={vendedor} onClose={() => setDetalle(null)} />
        </div>
    )
}
