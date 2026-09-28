import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import TabBarVendedor, { ALTO_TABBAR_PX } from '@/components/TabBarVendedor'
import AgendaSemanaPage from '@/pages/AgendaSemanaPage'
import MetricasPage from '@/pages/MetricasPage'
import { METRICAS_VENDEDOR_HABILITADAS } from '@/lib/flags'

/**
 * Las dos secciones del vendedor (Planificación | Métricas) bajo UN solo elemento de ruta.
 *
 * La agenda se OCULTA, nunca se desmonta: `VisitaFlow` y el estado de la visita en curso
 * (watch de GPS de `alejado`, `visitaEnCurso`, el veto de re-adopción) viven adentro de
 * `AgendaSemanaPage`, y desmontarla al cambiar de pestaña los perdería con la visita
 * todavía abierta. Por eso las dos rutas (`/` y `/metricas`) son hijas de este layout:
 * React Router conserva la misma instancia al navegar entre ellas.
 *
 * Métricas se monta la primera vez que se entra y después también queda montada, para
 * no volver a pedir los datos en cada cambio de pestaña.
 */
export default function VendedorShell() {
    const { pathname, search } = useLocation()
    const enMetricas = pathname === '/metricas'
    const busquedaPlani = useRef('')
    if (pathname === '/') busquedaPlani.current = search
    const [metricasVista, setMetricasVista] = useState(enMetricas)

    useEffect(() => {
        if (enMetricas) setMetricasVista(true)
    }, [enMetricas])

    // `VisitaEnCursoBar` es `fixed` y flota encima de la barra: lee este alto. Va en el
    // root porque la barra de visita se dibuja en un portal a <body>, fuera de este árbol.
    useEffect(() => {
        if (!METRICAS_VENDEDOR_HABILITADAS) return
        const raiz = document.documentElement
        raiz.style.setProperty('--alto-tabbar', `calc(${ALTO_TABBAR_PX}px + env(safe-area-inset-bottom))`)
        return () => {
            raiz.style.removeProperty('--alto-tabbar')
        }
    }, [])

    if (!METRICAS_VENDEDOR_HABILITADAS) {
        if (enMetricas) return <Navigate to="/" replace />
        return (
            <div className="h-dvh">
                <AgendaSemanaPage />
            </div>
        )
    }

    return (
        <div className="flex h-dvh flex-col overflow-hidden">
            <div className={enMetricas ? 'hidden' : 'min-h-0 flex-1'} data-testid="seccion-planificacion">
                <AgendaSemanaPage />
            </div>
            {metricasVista && (
                <div className={enMetricas ? 'min-h-0 flex-1' : 'hidden'} data-testid="seccion-metricas">
                    <MetricasPage />
                </div>
            )}
            <TabBarVendedor busquedaPlani={busquedaPlani.current} />
        </div>
    )
}
