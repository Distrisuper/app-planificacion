import { ChevronDown, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'

interface BottomSheetProps {
    open: boolean
    onClose: () => void
    title: string
    eyebrow?: string
    eyebrowClassName?: string
    /** Si se pasa, aparece un botón de minimizar al lado de la X. */
    onMinimize?: () => void
    children: ReactNode
}

export default function BottomSheet({
    open,
    onClose,
    title,
    eyebrow,
    eyebrowClassName,
    onMinimize,
    children,
}: BottomSheetProps) {
    if (!open) return null
    return (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
            <div
                className="animate-sheet-up max-h-[85vh] w-full overflow-y-auto rounded-t-[24px] bg-white px-[18px] pb-6 pt-3.5 shadow-[0_-10px_34px_rgba(10,15,30,.22)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[#DBE0EB]" />
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        {eyebrow && (
                            <span
                                className={`text-[11px] font-extrabold uppercase tracking-wide ${eyebrowClassName ?? 'text-dsgreen'}`}
                            >
                                {eyebrow}
                            </span>
                        )}
                        <h2 className="truncate text-[17px] font-extrabold leading-tight text-[#182645]">{title}</h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {onMinimize && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Minimizar"
                                onClick={onMinimize}
                                className="h-[30px] w-[30px] bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                            >
                                <ChevronDown className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Cerrar"
                            onClick={onClose}
                            className="h-[30px] w-[30px] bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                        >
                            <X className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        </Button>
                    </div>
                </div>
                {children}
            </div>
        </div>
    )
}
