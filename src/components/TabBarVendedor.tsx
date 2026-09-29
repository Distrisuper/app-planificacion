import { BarChart3, CalendarDays } from 'lucide-react'
import { NavLink } from 'react-router-dom'

/** Alto de la barra SIN el safe-area. `VendedorShell` publica el total (con el inset del
 *  iPhone) en `--alto-tabbar`, que es lo que usa `VisitaEnCursoBar` para flotar encima. */
export const ALTO_TABBAR_PX = 56


/**
 * Navegación entre las dos secciones del vendedor. Es un item del flex de `VendedorShell`,
 * no `fixed`: así el contenido de arriba se achica solo y la última card no queda tapada.
 * Los sheets de pantalla completa (z-50) la tapan: adentro de una visita no se navega.
 */
interface TabBarVendedorProps {
    /** Búsqueda (`?dia=…&semana=…`) con la que se dejó Plani: volver desde Métricas
     *  aterriza en la misma zona y el mismo día, no en HOY. */
    busquedaPlani?: string
}

export default function TabBarVendedor({ busquedaPlani = '' }: TabBarVendedorProps) {
    const TABS = [
        { to: `/${busquedaPlani}`, label: 'Plani', Icono: CalendarDays },
        { to: '/metricas', label: 'Métricas', Icono: BarChart3 },
    ]
    return (
        <nav
            aria-label="Secciones"
            className="z-30 flex shrink-0 border-t border-dsline bg-white"
            style={{ height: `calc(${ALTO_TABBAR_PX}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            {TABS.map(({ to, label, Icono }) => (
                <NavLink
                    key={label}
                    to={to}
                    end
                    className={({ isActive }) =>
                        `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold ${
                            isActive ? 'text-dsnavy' : 'text-dsmuted'
                        }`
                    }
                >
                    {({ isActive }) => (
                        <>
                            <Icono className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 2} />
                            {label}
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    )
}
