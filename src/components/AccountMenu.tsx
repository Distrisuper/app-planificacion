import { useEffect, useRef, useState } from 'react'
import { LogOut, Calendar } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

interface AccountMenuProps {
    nombre: string
    onLogout: () => void
    onCerrarSemana?: () => void
}

function initialsOf(name: string) {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase())
        .join('')
    return initials || 'V'
}

export default function AccountMenu({ nombre, onLogout, onCerrarSemana }: AccountMenuProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onPointerDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Cuenta"
                className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-dsgreen/60 focus-visible:ring-offset-2"
            >
                <Avatar initials={initialsOf(nombre)} />
            </button>
            {open && (
                <div
                    role="menu"
                    className="animate-fade-in absolute right-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-xl border border-dsline bg-white text-left shadow-[0_10px_28px_rgba(10,15,30,.18)]"
                >
                    <div className="truncate border-b border-dsline px-3.5 py-2.5 text-[13px] font-bold text-[#182645]">{nombre}</div>
                    {onCerrarSemana && (
                        <>
                            <button
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false)
                                    onCerrarSemana()
                                }}
                                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-dsred hover:bg-[#FEECEC]"
                            >
                                <Calendar className="h-4 w-4" />
                                Cerrar semana
                            </button>
                            <div className="border-b border-dsline" />
                        </>
                    )}
                    <button
                        role="menuitem"
                        onClick={() => {
                            setOpen(false)
                            onLogout()
                        }}
                        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-dsred hover:bg-[#FEECEC]"
                    >
                        <LogOut className="h-4 w-4" />
                        Cerrar sesión
                    </button>
                </div>
            )}
        </div>
    )
}
