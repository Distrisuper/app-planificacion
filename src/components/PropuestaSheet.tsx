import BottomSheet from './ui/BottomSheet'
import { usePropuesta } from '@/hooks/usePropuesta'

interface PropuestaSheetProps {
    open: boolean
    codigoCliente: string | null
    nombreCliente: string
    onIniciarVisita: () => void
    onVerVersus?: () => void
    onClose: () => void
}

export default function PropuestaSheet({ open, codigoCliente, nombreCliente, onIniciarVisita, onVerVersus, onClose }: PropuestaSheetProps) {
    const { data, isLoading } = usePropuesta(open ? codigoCliente : null)
    const rubros: Array<{ nombre: string }> = data?.rubros ?? []

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Propuesta comercial">
            <p className="text-[13px] text-dsmuted">
                Rubros donde compra <b className="text-dsred">por debajo del promedio</b> de la zona. Oportunidad de propuesta:
            </p>
            {isLoading ? (
                <div className="mt-3 text-sm text-dsmuted">Cargando propuesta…</div>
            ) : (
                <ul className="mt-3 flex flex-col gap-2">
                    {rubros.map((r, i) => (
                        <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-dsnavy">
                            {r.nombre}
                        </li>
                    ))}
                    {rubros.length === 0 && <li className="text-sm text-dsmuted">Sin oportunidades destacadas.</li>}
                </ul>
            )}
            <div className="mt-4 flex gap-2">
                {onVerVersus && (
                    <button onClick={onVerVersus} className="flex-1 rounded-lg border border-dsnavy py-3 text-sm font-semibold text-dsnavy">
                        Versus
                    </button>
                )}
                <button onClick={onIniciarVisita} className="flex-1 rounded-lg bg-dsnavy py-3 text-sm font-bold text-white">
                    Iniciar visita
                </button>
            </div>
        </BottomSheet>
    )
}
