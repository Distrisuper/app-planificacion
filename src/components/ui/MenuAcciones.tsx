import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

export interface AccionMenu {
    etiqueta: string
    onElegir: () => void
    /** Título chico que encabeza esta acción y las que siguen, hasta el próximo grupo. */
    grupo?: string
    /** Tooltip: qué hace, cuando la etiqueta no alcanza. */
    titulo?: string
}

interface MenuAccionesProps {
    /** Nombre accesible del botón "⋯", con lo que identifica la fila ("Más acciones: semana 2"). */
    etiqueta: string
    acciones: AccionMenu[]
}

const ANCHO_MENU = 208 // w-52

/**
 * El "⋯" de las acciones poco frecuentes de una fila. El menú va en un portal, en
 * coordenadas fijas, por la misma razón que `HelpPopover`: adentro de una tabla con
 * `overflow-x-auto` lo recortaría. Se cierra al elegir, al tocar afuera, con Escape o al
 * scrollear (más simple que reposicionarlo en vivo).
 */
export default function MenuAcciones({ etiqueta, acciones }: MenuAccionesProps) {
    const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null)
    const botonRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const abierto = posicion !== null

    const abrir = () => {
        const rect = botonRef.current?.getBoundingClientRect()
        if (!rect) return
        setPosicion({ top: rect.bottom + 4, left: Math.max(8, rect.left) })
    }
    const cerrar = () => setPosicion(null)

    useEffect(() => {
        if (!abierto) return
        const cerrarSiEsAfuera = (e: MouseEvent) => {
            const objetivo = e.target as Node
            if (botonRef.current?.contains(objetivo) || menuRef.current?.contains(objetivo)) return
            cerrar()
        }
        const cerrarConEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrar()
        }
        document.addEventListener('mousedown', cerrarSiEsAfuera)
        document.addEventListener('keydown', cerrarConEscape)
        window.addEventListener('scroll', cerrar, true)
        window.addEventListener('resize', cerrar)
        return () => {
            document.removeEventListener('mousedown', cerrarSiEsAfuera)
            document.removeEventListener('keydown', cerrarConEscape)
            window.removeEventListener('scroll', cerrar, true)
            window.removeEventListener('resize', cerrar)
        }
    }, [abierto])

    return (
        <>
            <button
                ref={botonRef}
                type="button"
                aria-label={etiqueta}
                aria-haspopup="menu"
                aria-expanded={abierto}
                onClick={() => (abierto ? cerrar() : abrir())}
                className="shrink-0 rounded p-0.5 text-tinta-2 hover:bg-superficie hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario"
            >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
            {posicion &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label={etiqueta}
                        style={{ top: posicion.top, left: posicion.left, width: ANCHO_MENU }}
                        className="fixed z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-linea bg-tarjeta py-1 text-[13px] shadow-lg"
                    >
                        {acciones.map(a => (
                            <div key={a.etiqueta}>
                                {a.grupo && (
                                    <p className="mt-1 border-t border-linea px-3 pb-0.5 pt-1.5 text-[11px] text-tinta-2">
                                        {a.grupo}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    role="menuitem"
                                    title={a.titulo}
                                    onClick={() => {
                                        cerrar()
                                        a.onElegir()
                                    }}
                                    className="block w-full px-3 py-1.5 text-left text-tinta hover:bg-superficie focus-visible:bg-superficie focus-visible:outline-none"
                                >
                                    {a.etiqueta}
                                </button>
                            </div>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    )
}
