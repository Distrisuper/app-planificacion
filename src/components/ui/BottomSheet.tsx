import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface BottomSheetProps {
    open: boolean
    onClose: () => void
    title: string
    eyebrow?: string
    children: ReactNode
}

export default function BottomSheet({ open, onClose, title, eyebrow, children }: BottomSheetProps) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
            <div
                className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5"
                onClick={e => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 h-1 w-10 rounded bg-slate-300" />
                <div className="flex items-start justify-between">
                    <div>
                        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-wide text-dsgreen">{eyebrow}</div>}
                        <h2 className="text-lg font-bold text-dsnavy">{title}</h2>
                    </div>
                    <button aria-label="Cerrar" onClick={onClose} className="rounded-full bg-slate-100 p-1.5 text-slate-500">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="mt-3">{children}</div>
            </div>
        </div>
    )
}
