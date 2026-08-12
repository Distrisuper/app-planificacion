import type { IVendedorOpcion } from '@/types/analitica'

interface SelectorVendedorProps {
    vendedores: IVendedorOpcion[]
    /** null = todavía no se eligió ninguno. */
    elegido: string | null
    onElegir: (codigo: string) => void
}

/**
 * Single-select, a diferencia del multi-select de `FiltrosAnalitica`: acá gerencia opera
 * sobre UN vendedor a la vez (su rotación es una), no compara varios como en un reporte.
 *
 * Es un `<select>` nativo y no un dropdown a mano: el repo no tiene primitiva de Select
 * (solo button/badge/avatar/BottomSheet/Notification), el nativo ya viene con teclado y
 * accesibilidad, y la lista de vendedores es corta.
 */
export default function SelectorVendedor({
    vendedores,
    elegido,
    onElegir,
}: SelectorVendedorProps) {
    return (
        <label className="flex flex-col text-xs font-medium text-slate-600">
            Vendedor
            <select
                aria-label="Vendedor"
                value={elegido ?? ''}
                onChange={e => onElegir(e.target.value)}
                className="mt-1 min-w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            >
                <option value="">Elegí un vendedor…</option>
                {vendedores.map(v => (
                    <option
                        key={v.codigoParticularVendedor}
                        value={v.codigoParticularVendedor}
                    >
                        {v.nombreVendedor}
                    </option>
                ))}
            </select>
        </label>
    )
}
