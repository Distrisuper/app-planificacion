import { cn } from '@/lib/utils'

interface PestanasProps<T extends string> {
    /** Nombre accesible de la navegación ("Métricas"). */
    etiqueta: string
    opciones: { valor: T; etiqueta: string }[]
    valor: T
    onCambiar: (valor: T) => void
    className?: string
}

/**
 * Subsecciones de una pantalla: texto con subrayado solo bajo la activa, sin línea de borde a
 * borde. Van en la misma fila que los filtros (a la izquierda) y a su mismo alto, 32 px: la
 * navegación de borde a borde es una sola, la de arriba.
 *
 * Son botones con `aria-current` y no links porque la subsección vive en un parámetro de la URL
 * de la misma ruta.
 */
export default function Pestanas<T extends string>({ etiqueta, opciones, valor, onCambiar, className }: PestanasProps<T>) {
    return (
        <nav aria-label={etiqueta} className={cn('flex flex-wrap items-center gap-x-5 gap-y-1', className)}>
            {opciones.map(o => {
                const activa = o.valor === valor
                return (
                    <button
                        key={o.valor}
                        type="button"
                        aria-current={activa ? 'page' : undefined}
                        onClick={() => onCambiar(o.valor)}
                        className={cn(
                            'inline-flex h-8 items-center whitespace-nowrap border-b-2 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario',
                            activa ? 'border-primario font-semibold text-tinta' : 'border-transparent text-tinta-2 hover:text-tinta',
                        )}
                    >
                        {o.etiqueta}
                    </button>
                )
            })}
        </nav>
    )
}
