import { Check } from 'lucide-react'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionRubroProps {
    rubro: IVisitaRubro
    /** Catálogo de nivel `rubro`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    value: IRubroMotivo[]
    onChange: (motivos: IRubroMotivo[]) => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Checklist + detalle de un rubro. Sin header ni botón de guardar propios: la navegación
 *  entre rubros y el guardado en lote los aporta ResolucionWizard, que envuelve a este
 *  componente y es el único con estado de posición/guardado. */
export default function ResolucionRubro({ rubro, motivos, value, onChange }: ResolucionRubroProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))

    function toggle(motivoId: number) {
        onChange(
            porId.has(motivoId)
                ? value.filter(m => m.motivoId !== motivoId)
                : [...value, { motivoId, ...VACIO }],
        )
    }

    // El detalle vive en la fila (visita_rubro_id, motivo_id), así que se edita POR
    // MOTIVO. Hoy solo "Precio" lo pide, pero modelarlo así hace que un segundo motivo
    // con requiereDetalle funcione sin tocar este código.
    function setDetalle(motivoId: number, campo: keyof typeof VACIO, valor: string) {
        onChange(
            value.map(m =>
                m.motivoId !== motivoId
                    ? m
                    : {
                          ...m,
                          [campo]:
                              campo === 'pctDiferencia'
                                  ? valor === ''
                                      ? null
                                      : Number(valor)
                                  : valor === ''
                                    ? null
                                    : valor,
                      },
            ),
        )
    }

    return (
        <div>
            <div className="mb-3 text-[12.5px] font-semibold text-dsmuted">{rubro.rubroDescripcion}</div>

            <div className="flex flex-col gap-2">
                {motivos.map(cat => {
                    const seleccionado = porId.get(cat.motivoId)
                    const on = !!seleccionado
                    return (
                        <div key={cat.motivoId} className="flex flex-col gap-0">
                            <button
                                onClick={() => toggle(cat.motivoId)}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans ${
                                    on ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span
                                    className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                    style={{
                                        borderColor: on ? '#213D82' : '#CBD2E0',
                                        background: on ? '#213D82' : '#fff',
                                        color: on ? '#fff' : 'transparent',
                                    }}
                                >
                                    <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />
                                </span>
                                <span
                                    className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}
                                >
                                    {cat.descripcion}
                                </span>
                            </button>

                            {cat.requiereDetalle && on && (
                                <div className="ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <input
                                            value={seleccionado.marca ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'marca', e.target.value)}
                                            placeholder="Ej. Fric-Rot"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Competidor
                                        </span>
                                        <input
                                            value={seleccionado.competidor ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'competidor', e.target.value)}
                                            placeholder="Ej. Corven"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <label
                                            htmlFor={`pct-${cat.motivoId}`}
                                            className="text-[12.5px] font-bold text-[#3B4560]"
                                        >
                                            % de diferencia
                                        </label>
                                        <div className="flex flex-1 items-center justify-end gap-1">
                                            <input
                                                id={`pct-${cat.motivoId}`}
                                                value={seleccionado.pctDiferencia ?? ''}
                                                onChange={e =>
                                                    setDetalle(
                                                        cat.motivoId,
                                                        'pctDiferencia',
                                                        e.target.value.replace(/[^0-9.]/g, ''),
                                                    )
                                                }
                                                inputMode="decimal"
                                                placeholder="0"
                                                className="w-16 rounded-lg border border-[#E1E6F0] px-2 py-1.5 text-right text-sm font-extrabold text-dsnavy outline-none"
                                            />
                                            <span className="text-[15px] font-extrabold text-dsnavy">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
