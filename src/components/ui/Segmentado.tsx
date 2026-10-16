import { cn } from '@/lib/utils'

export interface OpcionSegmentado<T extends string> {
    valor: T
    etiqueta: string
    titulo?: string
}

interface SegmentadoProps<T extends string> {
    /** Nombre accesible del grupo ("Tipo de persona", "Período"). */
    etiqueta: string
    opciones: OpcionSegmentado<T>[]
    valor: T
    onCambiar: (valor: T) => void
    className?: string
}

/**
 * El único segmentado de la app (opciones excluyentes: tipo de persona, Día/Semana/Mes). A 32 px
 * como el resto de los filtros; la opción activa es una tarjeta blanca con borde, no un relleno
 * de color, para que no compita con el dato.
 */
export default function Segmentado<T extends string>({ etiqueta, opciones, valor, onCambiar, className }: SegmentadoProps<T>) {
    return (
        <div
            role="group"
            aria-label={etiqueta}
            className={cn('inline-flex h-8 shrink-0 gap-0.5 rounded-lg border border-linea bg-superficie p-0.5', className)}
        >
            {opciones.map(o => {
                const activa = o.valor === valor
                return (
                    <button
                        key={o.valor}
                        type="button"
                        title={o.titulo}
                        aria-pressed={activa}
                        onClick={() => onCambiar(o.valor)}
                        className={cn(
                            'whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario',
                            activa ? 'bg-tarjeta font-semibold text-tinta ring-1 ring-linea' : 'text-tinta-2 hover:text-tinta',
                        )}
                    >
                        {o.etiqueta}
                    </button>
                )
            })}
        </div>
    )
}
