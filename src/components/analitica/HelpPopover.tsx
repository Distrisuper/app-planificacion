import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface HelpPopoverProps {
    /** Nombre accesible del botón, ej. "Qué significa Efectividad operativa". */
    label: string
    children: React.ReactNode
    align?: 'left' | 'right'
}

/** Botón "?" que abre un panel de ayuda con estilo propio (no depende del tooltip
 *  nativo del navegador). Se cierra con click afuera o Escape. */
export default function HelpPopover({ label, children, align = 'right' }: HelpPopoverProps) {
    const [abierto, setAbierto] = useState(false)
    const raiz = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!abierto) return
        const cerrarSiEsAfuera = (e: MouseEvent) => {
            if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
        }
        const cerrarConEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setAbierto(false)
        }
        document.addEventListener('mousedown', cerrarSiEsAfuera)
        document.addEventListener('keydown', cerrarConEscape)
        return () => {
            document.removeEventListener('mousedown', cerrarSiEsAfuera)
            document.removeEventListener('keydown', cerrarConEscape)
        }
    }, [abierto])

    return (
        <div ref={raiz} className="relative inline-flex normal-case">
            <button
                type="button"
                aria-label={label}
                aria-expanded={abierto}
                onClick={() => setAbierto(a => !a)}
                className="flex shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
            >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {abierto && (
                <div
                    role="dialog"
                    className={`absolute top-5 z-30 w-72 rounded-lg border border-slate-200 bg-white p-4 text-left text-xs font-normal normal-case tracking-normal text-slate-600 shadow-lg ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {children}
                </div>
            )}
        </div>
    )
}
