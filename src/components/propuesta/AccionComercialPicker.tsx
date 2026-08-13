import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import { registroDetalleAccion } from './accionDetalle/registro'
import type { IAccionComercial, ICatalogoItem } from '@/types/planificacion'

interface AccionComercialPickerProps {
    acciones: ICatalogoItem[]
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    value: IAccionComercial | null
    onChange: (value: IAccionComercial | null) => void
}

/** "¿Con acción comercial?": con qué se ofreció este rubro (Plan cupo, Descuento),
 *  sobre qué marca y con qué parámetros. Colapsado por defecto y opcional — la mayoría
 *  de los rubros se resuelven sin acción, y ahí la pantalla queda igual que siempre.
 *
 *  Presentacional puro: los catálogos llegan por props (los pide ResolucionWizard), así
 *  que su test no necesita React Query. Los editores de parámetros salen del registro
 *  por código de acción (accionDetalle/registro.ts) — sumar una acción con parámetros
 *  nuevos no toca este archivo. */
export default function AccionComercialPicker({
    acciones,
    marcas,
    marcasLoading,
    value,
    onChange,
}: AccionComercialPickerProps) {
    const [abierto, setAbierto] = useState(!!value)
    const [marcaAbierta, setMarcaAbierta] = useState(false)

    const moduloDetalle = value ? registroDetalleAccion[value.accion] : undefined

    // Cambiar de acción descarta los params: los tramos de un Cupo no significan nada
    // para un Descuento (que es un % suelto).
    function elegirAccion(item: ICatalogoItem) {
        onChange({ accion: item.code, marca: value?.marca ?? null })
    }

    if (!abierto && !value) {
        return (
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="mb-3 flex w-full items-center gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#8A93A6]">
                    ¿Con acción comercial?
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
            </button>
        )
    }

    return (
        <div className="animate-panel-in mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Acción comercial
            </span>

            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => {
                        onChange(null)
                        setAbierto(false)
                    }}
                    className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                        value
                            ? 'border-[#E1E6F0] bg-white text-[#3B4560]'
                            : 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                    }`}
                >
                    Sin acción
                </button>
                {acciones.map(a => {
                    const on = value?.accion === a.code
                    return (
                        <button
                            key={a.code}
                            type="button"
                            onClick={() => elegirAccion(a)}
                            className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                                on
                                    ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                    : 'border-[#E1E6F0] bg-white text-[#3B4560]'
                            }`}
                        >
                            {a.description}
                        </button>
                    )
                })}
            </div>

            {value && (
                <>
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                            Marca
                        </span>
                        <button
                            type="button"
                            aria-label="Marca"
                            onClick={() => setMarcaAbierta(!marcaAbierta)}
                            className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                        >
                            <span
                                className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                    value.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                                }`}
                            >
                                {value.marca ?? 'Todas / no aplica'}
                            </span>
                            {value.marca && (
                                <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                            )}
                            <ChevronDown
                                className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                                    marcaAbierta ? 'rotate-180' : ''
                                }`}
                                strokeWidth={2.4}
                            />
                        </button>
                        {marcaAbierta && (
                            <div className="animate-panel-in mt-1.5">
                                <CatalogoPicker
                                    items={marcas}
                                    loading={marcasLoading}
                                    value={value.marca}
                                    onSelect={item => {
                                        onChange({ ...value, marca: item.description })
                                        setMarcaAbierta(false)
                                    }}
                                    placeholder="Buscar marca…"
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>

                    {moduloDetalle && (
                        <moduloDetalle.Editor
                            value={value.params}
                            onChange={params => onChange({ ...value, params })}
                        />
                    )}
                </>
            )}
        </div>
    )
}
