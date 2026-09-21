import { NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { veMetricas } from '@/lib/roles'

export const ALTO_BARRA_TABS = 56

const TABS = [
    { to: '/', label: 'Agenda', Icono: CalendarDays, end: true },
    { to: '/cartera', label: 'Mi cartera', Icono: BarChart3, end: false },
]

/** Barra inferior del vendedor. No es `fixed`: va como último hijo del `flex-col h-dvh`
 *  de cada página, así la agenda se achica sola y nada queda tapado. Lo único flotante
 *  que convive con ella es VisitaEnCursoBar, que se corre con `sobreBarraTabs`. */
export default function BarraTabs() {
    const { capacidades } = useAuth()
    if (!veMetricas(capacidades)) return null
    return (
        <nav
            aria-label="Secciones"
            className="flex shrink-0 border-t border-dsline bg-white"
            style={{ height: ALTO_BARRA_TABS, paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            {TABS.map(({ to, label, Icono, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                        `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive ? 'text-dsnavy' : 'text-dsmuted'}`
                    }
                >
                    <Icono className="h-5 w-5" strokeWidth={2.2} />
                    {label}
                </NavLink>
            ))}
        </nav>
    )
}
