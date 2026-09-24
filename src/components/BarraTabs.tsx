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
            /* `height` fijo + `paddingBottom` con `border-box` (box-sizing global del
             *  proyecto) hacía que el padding se RESTARA de los 56px en vez de sumarse: en
             *  un dispositivo con home indicator grande (~34px en iPhone) los íconos y
             *  labels quedaban apretados en ~22px. `calc()` hace que el safe-area area sea
             *  ADITIVA: el contenido siempre tiene sus 56px completos, y el padding crece
             *  la barra hacia abajo. VisitaEnCursoBar's `sobreBarraTabs` offset (en
             *  VisitaEnCursoBar.tsx) también se corrigió para sumar
             *  `env(safe-area-inset-bottom)` — antes solo compensaba los 56px de banda de
             *  contenido y la barra flotante quedaba tapada por el padding extra. */
            style={{
                height: `calc(${ALTO_BARRA_TABS}px + env(safe-area-inset-bottom))`,
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
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
