import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabClase = (isActive: boolean) =>
    cn(
        'inline-flex h-8 items-center whitespace-nowrap border-b-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario',
        isActive ? 'border-primario font-bold text-tinta' : 'border-transparent font-medium text-tinta-2 hover:text-tinta',
    )

/** La navegación de borde a borde de gerencia (la única: las subsecciones de cada pantalla van
 *  como `Pestanas`). Analítica de visitas, Actividad y Datos del comercio salieron de las tabs:
 *  sus rutas siguen andando por URL, pero gerencia trabaja con estas tres. */
export default function AnaliticaTabs() {
    return (
        <nav aria-label="Gerencia" className="flex items-center gap-5">
            <NavLink to="/analitica/metricas" className={({ isActive }) => tabClase(isActive)}>
                Métricas
            </NavLink>
            <NavLink to="/analitica/ruta" className={({ isActive }) => tabClase(isActive)}>
                Ruta
            </NavLink>
            <NavLink to="/analitica/altas" className={({ isActive }) => tabClase(isActive)}>
                Altas
            </NavLink>
        </nav>
    )
}
