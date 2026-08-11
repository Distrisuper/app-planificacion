import { NavLink } from 'react-router-dom'

interface AnaliticaTabsProps {
    enVivo?: boolean
}

const tabClase = (isActive: boolean) =>
    `border-b-2 px-1 pb-3 text-sm transition-colors ${
        isActive
            ? 'border-slate-900 font-semibold text-slate-900'
            : 'border-transparent font-medium text-slate-500 hover:text-slate-700'
    }`

export default function AnaliticaTabs({ enVivo }: AnaliticaTabsProps) {
    return (
        <nav className="flex gap-6 border-b border-slate-200">
            <NavLink to="/analitica" end className={({ isActive }) => tabClase(isActive)}>
                Analítica de visitas
            </NavLink>
            <NavLink
                to="/analitica/actividad"
                className={({ isActive }) => `flex items-center gap-2 ${tabClase(isActive)}`}
            >
                Actividad
                {enVivo && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        En vivo
                    </span>
                )}
            </NavLink>
            <NavLink
                to="/analitica/ruta"
                className={({ isActive }) => tabClase(isActive)}
            >
                Ruta
            </NavLink>
        </nav>
    )
}
