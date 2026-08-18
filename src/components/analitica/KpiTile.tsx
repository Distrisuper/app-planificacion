interface KpiTileProps {
    titulo: string
    valor: string
    nota?: string
}

export default function KpiTile({ titulo, valor, nota }: KpiTileProps) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
            {nota && <p className="mt-0.5 text-xs text-amber-600">{nota}</p>}
        </div>
    )
}
