import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1',
    {
        variants: {
            variant: {
                default: 'bg-dsnavy text-white hover:bg-dsnavy/90',
                outline: 'border border-[#D8DEEA] bg-white text-dsnavy hover:bg-dsnavy/5',
                ghost: 'bg-transparent text-dsnavy hover:bg-black/5',
            },
            size: {
                default: 'h-11 px-4 text-sm font-bold',
                sm: 'h-8 px-3 text-xs',
                icon: 'h-9 w-9 shrink-0 rounded-full p-0',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    /** Muestra un spinner y deshabilita el botón — para cualquier acción async (mutación,
     *  captura de ubicación, etc.), no solo mientras `disabled` está seteado a mano. */
    loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
        >
            {loading && <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin" strokeWidth={2.5} />}
            {children}
        </button>
    ),
)
Button.displayName = 'Button'
