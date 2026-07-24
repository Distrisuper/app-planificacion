import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => (
        <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    ),
)
Button.displayName = 'Button'
