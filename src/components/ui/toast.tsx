import { Check } from 'lucide-react'

interface ToastProps {
    message: string | null
}

export function Toast({ message }: ToastProps) {
    if (!message) return null
    return (
        <div className="animate-toast-in fixed bottom-8 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-dsnavytext px-[18px] py-[11px] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(10,15,30,.32)]">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.6} />
            {message}
        </div>
    )
}
