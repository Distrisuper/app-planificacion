import { Loader2 } from 'lucide-react'

interface CargandoProps {
    texto?: string
}

/** Spinner de los bloques de Métricas. Algunos pedidos tardan unos segundos (cruzan el
 *  warehouse), y un "Cargando…" en gris chico se perdía en la tarjeta. */
export default function Cargando({ texto = 'Cargando…' }: CargandoProps) {
    return (
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" strokeWidth={2.4} />
            {texto}
        </div>
    )
}

/** Capa sobre una tabla que ya tiene datos mientras llega otra página u otro orden: la
 *  tabla queda visible pero atenuada, para que se note que lo que se ve está por cambiar. */
export function Actualizando() {
    return (
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-white/60 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" strokeWidth={2.4} />
            Actualizando…
        </div>
    )
}
