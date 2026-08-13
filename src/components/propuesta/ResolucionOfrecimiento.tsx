import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import AccionComercialPicker from './AccionComercialPicker'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'
import type { IAccionComercial, ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

interface ResolucionOfrecimientoProps {
    /** Catálogo de nivel `ofrecimiento`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    /** Catálogo de marcas. Restringir la elección es lo único que hace agregable la
     *  columna `marca`: con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT". */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    /** Catálogo de acciones comerciales (pl_accion). */
    acciones: ICatalogoItem[]
    /** La acción con la que se resolvió este ofrecimiento, si hubo. */
    accion: IAccionComercial | null
    onChangeAccion: (accion: IAccionComercial | null) => void
    value: IOfrecimientoMotivo[]
    onChange: (motivos: IOfrecimientoMotivo[]) => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Checklist + detalle de un ofrecimiento. Sin header, nombre ni botón de guardar
 *  propios: eso lo aporta ResolucionWizard, que envuelve a este componente en su header
 *  fijo y es el único con estado de posición/guardado. */
export default function ResolucionOfrecimiento({
    motivos,
    marcas,
    marcasLoading,
    acciones,
    accion,
    onChangeAccion,
    value,
    onChange,
}: ResolucionOfrecimientoProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))

    // Acción y marca son dos chips independientes, pero comparten el mismo dato de
    // fondo (`accion`, el que viaja al backend como `detalle`): la marca no se duplica
    // entre los dos — si hay acción elegida, es SU marca.
    function onChangeAccionChip(nuevo: { accion: string; params?: unknown } | null) {
        if (nuevo) {
            onChangeAccion({ ...nuevo, marca: accion?.marca ?? null })
        } else if (accion?.marca) {
            onChangeAccion({ accion: null, marca: accion.marca })
        } else {
            onChangeAccion(null)
        }
    }

    function onChangeMarcaChip(marca: string | null) {
        if (!accion?.accion && !marca) {
            onChangeAccion(null)
        } else {
            onChangeAccion({ accion: accion?.accion ?? null, marca, params: accion?.params })
        }
    }

    // Qué motivo tiene abierto su selector de marca (null = ninguno).
    const [marcaAbierta, setMarcaAbierta] = useState<number | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Sin esto el teclado virtual tapa la lista justo cuando aparece.
    useEffect(() => {
        const el = panelRef.current
        if (marcaAbierta !== null && el?.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest' })
        }
    }, [marcaAbierta])

    function toggle(motivoId: number) {
        onChange(
            porId.has(motivoId)
                ? value.filter(m => m.motivoId !== motivoId)
                : [...value, { motivoId, ...VACIO }],
        )
    }

    // El detalle vive en la fila (ofrecimiento_id, motivo_id), así que se edita POR
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
            <AccionComercialPicker
                acciones={acciones}
                value={accion?.accion ? { accion: accion.accion, params: accion.params } : null}
                onChange={onChangeAccionChip}
            />

            <MarcaOfrecimientoPicker
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={accion?.marca ?? null}
                onChange={onChangeMarcaChip}
            />

            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Resolución
            </span>
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
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Marca"
                                            onClick={() =>
                                                setMarcaAbierta(
                                                    marcaAbierta === cat.motivoId
                                                        ? null
                                                        : cat.motivoId,
                                                )
                                            }
                                            className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                                        >
                                            <span
                                                className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                                    seleccionado.marca
                                                        ? 'text-[#182645]'
                                                        : 'text-[#8A93A6]'
                                                }`}
                                            >
                                                {seleccionado.marca ?? 'Elegí una marca'}
                                            </span>
                                            {seleccionado.marca && (
                                                <Check
                                                    className="h-4 w-4 shrink-0 text-[#213D82]"
                                                    strokeWidth={3}
                                                />
                                            )}
                                            <ChevronDown
                                                className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                                                    marcaAbierta === cat.motivoId ? 'rotate-180' : ''
                                                }`}
                                                strokeWidth={2.4}
                                            />
                                        </button>
                                        {marcaAbierta === cat.motivoId && (
                                            <div ref={panelRef} className="animate-panel-in mt-1.5">
                                                <CatalogoPicker
                                                    items={marcas}
                                                    loading={marcasLoading}
                                                    value={seleccionado.marca}
                                                    onSelect={item => {
                                                        setDetalle(
                                                            cat.motivoId,
                                                            'marca',
                                                            item.description,
                                                        )
                                                        setMarcaAbierta(null)
                                                    }}
                                                    placeholder="Buscar marca…"
                                                    autoFocus
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {/* Mientras el picker de marca está abierto, Competidor y
                                     *  %diferencia se ocultan: son campos chicos, pero sumados
                                     *  a la lista competían por el mismo espacio visible del
                                     *  sheet y terminaban tapados por el pie fijo. Reaparecen
                                     *  solos al elegir una marca (o cerrar el picker). */}
                                    {marcaAbierta !== cat.motivoId && (
                                        <>
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
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
