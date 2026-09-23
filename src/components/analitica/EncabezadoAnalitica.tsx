import type { ReactNode } from 'react'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'

interface EncabezadoAnaliticaProps {
    enVivo?: boolean
    /** Lo que va a la izquierda del menú de cuenta. Por defecto las tabs; el detalle del
     *  vendedor pone su "Volver" y su título. */
    izquierda?: ReactNode
    /** La barra propia de la pantalla (filtros, selector de vendedor): queda fija con el
     *  resto. */
    children?: ReactNode
}

/**
 * El encabezado de todas las pantallas de gerencia: tabs + menú de cuenta + la barra de la
 * pantalla, en UN bloque fijo arriba al scrollear. Las tablas de gerencia son largas y sin
 * esto tabs y filtros desaparecen a la primera pantalla.
 *
 * Vive en un solo lugar a propósito: cada página armaba su propio `<header>` y el sticky se
 * copiaba en cada una, así que una tab nueva nacía sin él.
 *
 * `z-20`: por encima del contenido que pasa por debajo, por debajo del panel de detalle de
 * visita (`z-30`) y de popovers/menús (`z-50`), que tienen que taparlo.
 */
export default function EncabezadoAnalitica({ enVivo, izquierda, children }: EncabezadoAnaliticaProps) {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()

    return (
        <div data-testid="encabezado-analitica" className="sticky top-0 z-20 bg-white shadow-sm">
            <header
                className={`flex justify-between gap-4 bg-white px-6 ${
                    izquierda ? 'items-start border-b border-slate-200 py-4' : 'items-center pt-4'
                }`}
            >
                <div className="min-w-0 flex-1">{izquierda ?? <AnaliticaTabs enVivo={enVivo} />}</div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>
            {children}
        </div>
    )
}
