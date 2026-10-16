import { NavLink } from 'react-router-dom'

const tabClase = (isActive: boolean) =>
    `border-b-2 px-1 pb-3 text-sm transition-colors ${
        isActive
            ? 'border-slate-900 font-semibold text-slate-900'
            : 'border-transparent font-medium text-slate-500 hover:text-slate-700'
    }`

/** Analítica de visitas, Actividad y Datos del comercio salieron de las tabs: sus rutas
 *  siguen andando por URL, pero gerencia trabaja con estas tres. */
export default function AnaliticaTabs() {
    return (
        <nav className="flex gap-6 border-b border-slate-200">
            <NavLink to="/analitica/metricas" className={({ isActive }) => tabClase(isActive)}>
                Métricas
            </NavLink>
            <NavLink
                to="/analitica/ruta"
                className={({ isActive }) => tabClase(isActive)}
            >
                Ruta
            </NavLink>
            <NavLink to="/analitica/altas" className={({ isActive }) => tabClase(isActive)}>
                Altas
            </NavLink>
        </nav>
    )
}
