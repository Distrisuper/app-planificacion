import { OPCIONES_CANAL } from '@/lib/contactos'
import type { CanalContacto } from '@/types/analitica'

interface FiltroCanalProps {
    canal: CanalContacto | undefined
    onCambiar: (canal: CanalContacto | undefined) => void
}

/** Todo | Visitas | Llamados, sobre la tabla de contactos. */
export default function FiltroCanal({ canal, onCambiar }: FiltroCanalProps) {
    return (
        <div role="group" aria-label="Canal" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {OPCIONES_CANAL.map(o => {
                const activo = canal === o.valor
                return (
                    <button
                        key={o.etiqueta}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => onCambiar(o.valor)}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                            activo ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        {o.etiqueta}
                    </button>
                )
            })}
        </div>
    )
}
