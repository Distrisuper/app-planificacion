import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

interface HelpPopoverProps {
    /** Nombre accesible del botón, ej. "Qué significa Efectividad operativa". */
    label: string
    children: React.ReactNode
    align?: 'left' | 'right'
}

const ANCHO_PANEL = 288 // w-72

/** Botón "?" que abre un panel de ayuda con estilo propio (no depende del tooltip
 *  nativo del navegador).
 *
 *  El panel se renderiza en un portal a `document.body`, posicionado en
 *  coordenadas de viewport (fixed) a partir del botón — no como hijo posicionado
 *  `absolute` dentro del trigger. Si viviera adentro de un contenedor con
 *  `overflow-x-auto` (como la tabla de vendedores), ese contenedor pasa a
 *  necesitar scroll en los dos ejes para poder clipear el panel — así apareció
 *  el scroll vertical espurio en la tabla. Con el portal, el contenedor nunca ve
 *  el panel y no necesita scrollear. */
export default function HelpPopover({ label, children, align = 'right' }: HelpPopoverProps) {
    const [abierto, setAbierto] = useState(false)
    const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null)
    const botonRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const abrir = () => {
        const rect = botonRef.current?.getBoundingClientRect()
        if (!rect) return
        const left = align === 'right' ? rect.right - ANCHO_PANEL : rect.left
        setPosicion({ top: rect.bottom + 6, left: Math.max(8, left) })
        setAbierto(true)
    }

    useEffect(() => {
        if (!abierto) return

        const cerrarSiEsAfuera = (e: MouseEvent) => {
            const objetivo = e.target as Node
            if (botonRef.current?.contains(objetivo) || panelRef.current?.contains(objetivo)) return
            setAbierto(false)
        }
        const cerrar = () => setAbierto(false)
        const cerrarConEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setAbierto(false)
        }

        document.addEventListener('mousedown', cerrarSiEsAfuera)
        document.addEventListener('keydown', cerrarConEscape)
        // El panel está en coordenadas fijas: si el contenedor scrollea (ej. la
        // tabla en horizontal) o cambia el tamaño de ventana, dejaría de estar
        // alineado con el botón. Más simple cerrarlo que recalcular en vivo.
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
                aria-label={label}
                aria-expanded={abierto}
                onClick={() => (abierto ? setAbierto(false) : abrir())}
                className="flex shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
            >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {abierto &&
                posicion &&
                createPortal(
                    <div
                        ref={panelRef}
                        role="dialog"
                        style={{ top: posicion.top, left: posicion.left, width: ANCHO_PANEL }}
                        className="fixed z-50 rounded-lg border border-slate-200 bg-white p-4 text-left text-xs font-normal normal-case tracking-normal text-slate-600 shadow-lg"
                    >
                        {children}
                    </div>,
                    document.body,
                )}
        </>
    )
}
