import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountMenu from '@/components/AccountMenu'
import BarraTabs from '@/components/BarraTabs'
import VisitaEnCursoBar from '@/components/VisitaEnCursoBar'
import BannerPrueba, { ALTO_BANNER_PRUEBA } from '@/components/prueba/BannerPrueba'
import DetalleClientesSheet from '@/components/metricas/DetalleClientesSheet'
import PanelMetricas, { type DetalleArgs } from '@/components/metricas/PanelMetricas'
import SelectorMes from '@/components/metricas/SelectorMes'
import { useAuth } from '@/context/AuthContext'
import { estaProbando } from '@/lib/roles'
import { mesActual } from '@/lib/metricas/mes'
import { leerVisitaEnCurso } from '@/lib/visitaEnCurso'

/** Tab "Mi cartera" del vendedor. Shell propio (sin navegador de zonas ni progreso: son
 *  de la agenda). Spec docs/superpowers/specs/2026-09-21-metricas-vendedor-y-gerencia-design.md */
export default function CarteraPage() {
    const { user, logout, capacidades } = useAuth()
    const probando = estaProbando(capacidades)
    const navigate = useNavigate()
    const [mes, setMes] = useState(() => mesActual())
    const [detalle, setDetalle] = useState<DetalleArgs | null>(null)
    const visitaEnCurso = leerVisitaEnCurso()

    return (
        <div
            className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]"
            style={probando ? { paddingTop: ALTO_BANNER_PRUEBA } : undefined}
        >
            <BannerPrueba />
            <header className="flex items-center justify-between gap-2 bg-dsnavy px-4 pb-3.5 pt-3 text-white">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                        <span className="text-[15px] font-black leading-none tracking-tight text-dsnavy">
                            D<span className="text-dsgreen">S</span>
                        </span>
                    </div>
                    <span className="truncate text-[15px] font-extrabold tracking-tight">DistriSuper</span>
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>
            <h1 className="px-4 pt-3 text-[18px] font-extrabold text-dsnavytext">Mi cartera</h1>
            <SelectorMes mes={mes} onCambiar={setMes} />
            <main className="flex-1 overflow-y-auto">
                <PanelMetricas mes={mes} propio onDetalle={setDetalle} />
            </main>
            <BarraTabs />
            <DetalleClientesSheet detalle={detalle} mes={mes} onClose={() => setDetalle(null)} />
            {visitaEnCurso && (
                <VisitaEnCursoBar
                    visitaId={visitaEnCurso.visitaId}
                    nombreCliente={visitaEnCurso.cliente.nombreFantasia || visitaEnCurso.cliente.nombreCliente}
                    sobreBarraTabs
                    onExpandir={() => navigate('/?visita=abrir')}
                />
            )}
        </div>
    )
}
