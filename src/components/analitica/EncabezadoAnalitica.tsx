import type { ReactNode } from 'react'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'

interface EncabezadoAnaliticaProps {
    /** Lo que va a la izquierda del menú de cuenta. Por defecto las tabs; el detalle del
     *  vendedor pone su "Volver" y su título. */
    izquierda?: ReactNode
    /** Subsecciones y filtros de la pantalla, en la MISMA línea que las tabs y la cuenta (el
     *  estándar: una sola fila arriba). Las subsecciones van primero; los filtros, con `ml-auto`. */
    filtros?: ReactNode
    /** Una barra propia debajo de la línea, para las pantallas que todavía no migraron
     *  (Actividad, Datos del comercio, detalle del vendedor). */
    children?: ReactNode
}

/**
 * El encabezado de todas las pantallas de gerencia, en UN bloque fijo arriba al scrollear: las
 * tablas de gerencia son largas y sin esto tabs y filtros desaparecen a la primera pantalla.
 * Con `filtros`, tabs + subsecciones + filtros + cuenta van en una sola línea (Métricas, Ruta,
 * Altas); a lo angosto, la línea baja de renglón en vez de cortarse.
 *
 * `z-20`: por encima del contenido que pasa por debajo, por debajo del panel de detalle de
 * visita (`z-30`) y de popovers/menús (`z-50`), que tienen que taparlo.
 */
export default function EncabezadoAnalitica({ izquierda, filtros, children }: EncabezadoAnaliticaProps) {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()

    return (
        <div data-testid="encabezado-analitica" className="sticky top-0 z-20 border-b border-linea bg-tarjeta">
            <header
                className={`flex flex-wrap gap-x-4 gap-y-2 px-6 ${izquierda ? 'items-start py-4' : 'items-center py-2.5'}`}
            >
                {izquierda ? <div className="min-w-0 flex-1">{izquierda}</div> : <AnaliticaTabs />}
                {!izquierda && filtros && (
                    <>
                        <span className="h-5 w-px bg-linea" aria-hidden />
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">{filtros}</div>
                    </>
                )}
                {!izquierda && !filtros && <span className="flex-1" />}
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>
            {children && <div className="border-t border-linea">{children}</div>}
        </div>
    )
}
