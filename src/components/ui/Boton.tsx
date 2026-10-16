import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * El botón de las pantallas del estándar (Exportar CSV, Reintentar): 32 px como los filtros,
 * tarjeta con borde, sin relleno de color, para que no compita con el dato. El `Button` de
 * `ui/button.tsx` (navy, 44 px) es el de la app del vendedor.
 */
export default function Boton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type={type}
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-linea bg-tarjeta px-3 text-[13px] font-semibold text-tinta transition-colors hover:bg-superficie focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    )
}
