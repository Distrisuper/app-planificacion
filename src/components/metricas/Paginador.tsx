interface PaginadorProps {
    pagina: number
    total: number
    cant: number
    onCambiar: (p: number) => void
}

export default function Paginador({ pagina, total, cant, onCambiar }: PaginadorProps) {
    const paginas = Math.max(1, Math.ceil(total / cant))
    if (paginas <= 1) return null
    const boton = 'text-sm text-slate-700 hover:text-slate-900 disabled:text-slate-300'
    return (
        <div className="flex items-center justify-between pt-2">
            <button type="button" className={boton} disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
                ← Anterior
            </button>
            <span className="text-xs text-slate-500">Página {pagina} de {paginas}</span>
            <button type="button" className={boton} disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>
                Siguiente →
            </button>
        </div>
    )
}
