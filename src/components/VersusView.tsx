interface VersusViewProps {
    codigoCliente: string
    onBack: () => void
}

export default function VersusView({ codigoCliente, onBack }: VersusViewProps) {
    return (
        <div className="p-4">
            <button onClick={onBack} className="text-sm font-semibold text-dsnavy">‹ Volver</button>
            <h2 className="mt-2 text-lg font-bold text-dsnavy">Versus — {codigoCliente}</h2>
            <p className="mt-2 text-sm text-dsmuted">
                Vista de ventas/propuestas del cliente (motor `/sale/analytics`). Integrar la vista de evolución por SR.
            </p>
        </div>
    )
}
