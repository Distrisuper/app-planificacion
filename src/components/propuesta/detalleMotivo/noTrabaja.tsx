import type { IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Qué marca trabaja el cliente y por qué. `marca_trabaja` es texto libre y no catálogo: es
 *  una marca de la competencia, no está en fct_sales. `por_que` es lo único deliberadamente
 *  no analizable del dominio — contexto para leer, no para agrupar. */
export function EditorNoTrabaja({ valores, onChange }: IPropsEditorMotivo) {
    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
                <span className={LABEL}>¿Qué marca trabaja?</span>
                <input
                    value={(valores.marca_trabaja as string) ?? ''}
                    onChange={e => onChange({ marca_trabaja: e.target.value })}
                    placeholder="Ej. Corven"
                    className={INPUT}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className={LABEL}>¿Por qué?</span>
                <textarea
                    value={(valores.por_que as string) ?? ''}
                    onChange={e => onChange({ por_que: e.target.value })}
                    placeholder="Motivo del cliente"
                    rows={3}
                    className={`${INPUT} resize-none`}
                />
            </label>
        </div>
    )
}
