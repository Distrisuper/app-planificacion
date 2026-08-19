import type { IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Un plazo es una cantidad de días (30, 40, 1). Se guarda como número y no como texto para
 *  que se pueda promediar — es la diferencia entre poder responder "cuántos días piden en
 *  promedio" y no poder. */
export function EditorPlazo({ valores, onChange }: IPropsEditorMotivo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>Plazo solicitado</span>
            <input
                value={(valores.plazo_dias as number) ?? ''}
                onChange={e => {
                    const limpio = e.target.value.replace(/[^0-9]/g, '')
                    onChange({ plazo_dias: limpio === '' ? null : Number(limpio) })
                }}
                inputMode="numeric"
                placeholder="Ej. 30"
                className={INPUT}
            />
        </label>
    )
}
