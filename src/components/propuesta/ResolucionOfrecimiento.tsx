import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import AccionComercialPicker from './AccionComercialPicker'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'
import type { IAccionComercial, ICatalogoItem, IMotivo, IOfrecimientoMotivo, ResultadoMotivo } from '@/types/planificacion'

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
    /** Cuántos rubros quedan por resolver además de este. 0 = no se ofrecen los checks
     *  de "aplicar a restantes" (uno en el chip de Acción, otro en el de Marca). */
    rubrosRestantes?: number
    /** Copia esta acción a los rubros restantes — una sola vez, al tildar SU check. La
     *  marca de cada rubro no se toca. */
    onAplicarAccion?: () => void
    /** Copia esta marca a los rubros restantes — una sola vez, al tildar SU check. La
     *  acción de cada rubro no se toca. */
    onAplicarMarca?: () => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Color del motivo tildado, según qué tan buena/mala es esa resolución — no según su
 *  nombre (eso hardcodearía la lista). `resultado` ya distingue exactamente esto:
 *  ganado = verde, diferido = amarillo (ni ganado ni perdido todavía), perdido =
 *  naranja (una objeción con la que se puede volver), no_ofrecido = rojo (ni se
 *  intentó). Sin tildar, el motivo queda neutro (ver uso más abajo). */
function colorDeResultado(resultado: ResultadoMotivo | null): { border: string; bg: string; check: string } {
    switch (resultado) {
        case 'ganado':
            return { border: '#9BE3B4', bg: '#EAFBF1', check: '#009E4F' }
        case 'diferido':
            return { border: '#F7DD8F', bg: '#FEF9E8', check: '#B8860B' }
        case 'perdido':
            return { border: '#F3C8A0', bg: '#FDF2E9', check: '#B45309' }
        case 'no_ofrecido':
            return { border: '#F1B3AC', bg: '#FDECEB', check: '#B42318' }
        default:
            return { border: '#B9CCEC', bg: '#EEF3FB', check: '#213D82' }
    }
}

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
    rubrosRestantes = 0,
    onAplicarAccion,
    onAplicarMarca,
}: ResolucionOfrecimientoProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    const resultadoPorId = new Map(motivos.map(m => [m.motivoId, m.resultado]))

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

    // Varios motivos del MISMO bucket conviven (dos razones de un "perdido": Precio +
    // Trabaja con otro). Pero "ganado" y "perdido" a la vez no tienen sentido — tildar
    // uno de otro bucket reemplaza lo que había, no lo acumula.
    function toggle(motivoId: number) {
        if (porId.has(motivoId)) {
            onChange(value.filter(m => m.motivoId !== motivoId))
            return
        }
        const resultadoNuevo = resultadoPorId.get(motivoId) ?? null
        const mismoBucket = value.every(m => (resultadoPorId.get(m.motivoId) ?? null) === resultadoNuevo)
        onChange(mismoBucket ? [...value, { motivoId, ...VACIO }] : [{ motivoId, ...VACIO }])
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
                rubrosRestantes={rubrosRestantes}
                onAplicarATodos={onAplicarAccion}
            />

            <MarcaOfrecimientoPicker
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={accion?.marca ?? null}
                onChange={onChangeMarcaChip}
                rubrosRestantes={rubrosRestantes}
                onAplicarATodos={onAplicarMarca}
            />

            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Resolución
            </span>
            {/* Grid de 2 columnas: con 12 motivos en el catálogo, una lista de una sola
             *  columna se comía media pantalla del sheet. El motivo con detalle (hoy
             *  "Precio") ocupa las 2 columnas mientras está tildado, para que su panel
             *  de marca/competidor/% tenga espacio. */}
            <div className="grid grid-cols-2 gap-2">
                {motivos.map(cat => {
                    const seleccionado = porId.get(cat.motivoId)
                    const on = !!seleccionado
                    const color = colorDeResultado(cat.resultado)
                    return (
                        <div
                            key={cat.motivoId}
                            className={`flex flex-col gap-0 ${cat.requiereDetalle && on ? 'col-span-2' : ''}`}
                        >
                            <button
                                onClick={() => toggle(cat.motivoId)}
                                className="flex w-full items-center gap-2 rounded-[11px] border-[1.5px] px-2.5 py-2 text-left font-sans"
                                style={{
                                    borderColor: on ? color.border : '#E4E8F0',
                                    background: on ? color.bg : '#fff',
                                }}
                            >
                                <span
                                    className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                    style={{
                                        borderColor: on ? color.check : '#CBD2E0',
                                        background: on ? color.check : '#fff',
                                        color: on ? '#fff' : 'transparent',
                                    }}
                                >
                                    <Check className="h-[12px] w-[12px]" strokeWidth={3.2} />
                                </span>
                                <span
                                    className={`min-w-0 truncate text-[13px] font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}
                                >
                                    {cat.descripcion}
                                </span>
                            </button>

                            {cat.requiereDetalle && on && (
                                <div
                                    className="animate-panel-in ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] bg-white p-2.5"
                                    style={{ borderColor: color.border }}
                                >
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <button
                                            type="button"
                                            /* No "Marca" a secas: choca con el chip
                                             * Marca del rubro, que está siempre a la
                                             * vista arriba. */
                                            aria-label="Marca del motivo"
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
