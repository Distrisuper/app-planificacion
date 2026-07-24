import { cn } from '@/lib/utils'

interface AvatarProps {
    initials: string
    className?: string
}

export function Avatar({ initials, className }: AvatarProps) {
    return (
        <div
            className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dsgreen text-[13px] font-extrabold text-white shadow-[0_2px_8px_rgba(0,158,79,.35)]',
                className,
            )}
        >
            {initials}
        </div>
    )
}
