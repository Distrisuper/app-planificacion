import { NavLink } from 'react-router-dom'

interface AnaliticaTabsProps {
    enVivo?: boolean
}

const tabClase = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 text-sm transition-colors ${
        isActive
            ? 'border-slate-900 font-semibold text-slate-900'
            : 'border-transparent font-medium text-slate-500 hover:text-slate-700'
    }`

export default function AnaliticaTabs({ enVivo }: AnaliticaTabsProps) {
    // Con cinco tabs la barra ya no entra en un teléfono: scrollea dentro del nav en vez de
    // empujar el ancho de toda la página.
    return (
        <nav className="flex gap-6 overflow-x-auto border-b border-slate-200">
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
            <NavLink
                to="/analitica/fichas"
                className={({ isActive }) => tabClase(isActive)}
            >
                Datos del comercio
            </NavLink>
            <NavLink
                to="/analitica/metricas"
                className={({ isActive }) => `flex items-center gap-2 ${tabClase(isActive)}`}
            >
                Métricas
                {/* Los objetivos de venta son provisorios (constantes del front hasta que
                    gerencia defina metas): el tag avisa que los números todavía se están ajustando. */}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Beta
                </span>
            </NavLink>
        </nav>
    )
}
