import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'
import type { ICatalogoItem, IAccionComercial, IMotivo, IOfrecimientoMotivo, ResultadoMotivo } from '@/types/planificacion'

interface ResolucionOfrecimientoProps {
    /** Catálogo de nivel `ofrecimiento`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    /** Catálogo de marcas. Restringir la elección es lo único que hace agregable la
     *  columna `marca`: con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT". */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    /** La marca de este ofrecimiento viaja en `accion.marca` — el campo `accion.accion`
     *  ya no es seteable desde este formulario (se sacó Acción Comercial), pero el tipo
     *  se mantiene porque otras partes del código (useOfrecimientos, OfrecimientoTable)
     *  siguen leyendo el mismo objeto. */
    accion: IAccionComercial | null
    onChangeAccion: (accion: IAccionComercial | null) => void
    value: IOfrecimientoMotivo[]
    onChange: (motivos: IOfrecimientoMotivo[]) => void
    /** Cuántos rubros quedan por resolver además de este. 0 = no se ofrece el check de
     *  "aplicar a restantes" de Marca. */
    rubrosRestantes?: number
    /** Copia esta marca a los rubros restantes — una sola vez, al tildar SU check. */
    onAplicarMarca?: () => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Color del motivo tildado, según qué tan buena/mala es esa resolución — no según su
 *  nombre (eso hardcodearía la lista). `resultado` ya distingue exactamente esto:
 *  ganado = verde, diferido = amarillo, perdido = naranja, no_ofrecido = rojo. Sin
 *  tildar, el motivo queda neutro. */
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

/** Los 2 bloques que comparten espacio, alternados por el segmentado. Se dibujan a
 *  ancho completo de a uno: en un teléfono, dos columnas de ~165px no dejan lugar a los
 *  paneles de detalle (el de Precio ya vive apretado, y hay más por venir). Que sean
 *  excluyentes no es una decisión de layout: `ganado` y `perdido` ya no podían convivir
 *  en el dato — el segmentado lo hace visible en vez de sorpresivo.
 *
 *  `diferido` (Pendientes) NO entra acá: queda siempre abajo, porque acompaña a una
 *  objeción. `no_ofrecido` y `null` tampoco: son el fallback "Otros", para que un motivo
 *  del catálogo que todavía no se re-clasificó no desaparezca en silencio. */
const BLOQUES: { titulo: string; resultado: ResultadoMotivo }[] = [
    { titulo: 'Objeción', resultado: 'perdido' },
    { titulo: 'Cierre', resultado: 'ganado' },
]
const TITULO_PENDIENTES = 'Pendientes'
const TITULO_OTROS = 'Otros'

/** Si dos resoluciones pueden estar tildadas a la vez.
 *
 *  Una objeción puede dejar algo pendiente ("no compró por precio, pero le queda el
 *  cupo"), así que `perdido` + `diferido` conviven. Un cierre no convive con nada más:
 *  si cerró, no quedó nada pendiente ni objetado. Y `ganado` con `perdido` es una
 *  contradicción directa. */
function conviven(a: ResultadoMotivo | null, b: ResultadoMotivo | null): boolean {
    if (a === b) return true
    return (
        (a === 'perdido' && b === 'diferido') || (a === 'diferido' && b === 'perdido')
    )
}

/** Checklist + detalle de un ofrecimiento. Sin header, nombre ni botón de guardar
 *  propios: eso lo aporta ResolucionWizard, que envuelve a este componente en su header
 *  fijo y es el único con estado de posición/guardado. */
export default function ResolucionOfrecimiento({
    motivos,
    marcas,
    marcasLoading,
    accion,
    onChangeAccion,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarMarca,
}: ResolucionOfrecimientoProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    const resultadoPorId = new Map(motivos.map(m => [m.motivoId, m.resultado]))

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

    // Qué lado del segmentado se está viendo. Arranca donde ya hay carga (al retomar un
    // borrador, abrir en Objeción cuando lo tildado es un Cierre obligaría a buscarlo);
    // si no hay nada tildado, en Objeción. Es estado inicial y no un efecto: cambiar de
    // segmento después es del vendedor, no algo que se recalcule solo.
    const [segmento, setSegmento] = useState<ResultadoMotivo>(() =>
        value.some(m => resultadoPorId.get(m.motivoId) === 'ganado') ? 'ganado' : 'perdido',
    )

    // Sin esto el teclado virtual tapa la lista justo cuando aparece.
    useEffect(() => {
        const el = panelRef.current
        if (marcaAbierta !== null && el?.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest' })
        }
    }, [marcaAbierta])

    // Tildar conserva lo que puede convivir con el motivo nuevo y descarta el resto —
    // ver `conviven`. Filtrar en vez de vaciar es lo que permite que una objeción y un
    // pendiente coexistan sin que el orden en que se tildan cambie el resultado.
    function toggle(motivoId: number) {
        if (porId.has(motivoId)) {
            onChange(value.filter(m => m.motivoId !== motivoId))
            return
        }
        const resultadoNuevo = resultadoPorId.get(motivoId) ?? null
        const compatibles = value.filter(m =>
            conviven(resultadoPorId.get(m.motivoId) ?? null, resultadoNuevo),
        )
        onChange([...compatibles, { motivoId, ...VACIO }])
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

    function renderMotivo(cat: IMotivo) {
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
                                aria-label="Marca del motivo"
                                onClick={() =>
                                    setMarcaAbierta(marcaAbierta === cat.motivoId ? null : cat.motivoId)
                                }
                                className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                            >
                                <span
                                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                        seleccionado!.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                                    }`}
                                >
                                    {seleccionado!.marca ?? 'Elegí una marca'}
                                </span>
                                {seleccionado!.marca && (
                                    <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
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
                                        value={seleccionado!.marca}
                                        onSelect={item => {
                                            setDetalle(cat.motivoId, 'marca', item.description)
                                            setMarcaAbierta(null)
                                        }}
                                        placeholder="Buscar marca…"
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>
                        {marcaAbierta !== cat.motivoId && (
                            <>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                        Competidor
                                    </span>
                                    <input
                                        value={seleccionado!.competidor ?? ''}
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
                                            value={seleccionado!.pctDiferencia ?? ''}
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
    }

    const pendientes = motivos.filter(m => m.resultado === 'diferido')
    const otros = motivos.filter(m => m.resultado === null || m.resultado === 'no_ofrecido')
    // Un catálogo a medio migrar puede no tener ninguno de un bucket. Los bloques vacíos
    // no se ofrecen: un segmentado con una pestaña muerta invita a tocarla.
    const bloques = BLOQUES.map(b => ({
        ...b,
        items: motivos.filter(m => m.resultado === b.resultado),
    })).filter(b => b.items.length > 0)

    return (
        <div>
            <MarcaOfrecimientoPicker
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={accion?.marca ?? null}
                onChange={onChangeMarcaChip}
                rubrosRestantes={rubrosRestantes}
                onAplicarATodos={onAplicarMarca}
            />

            {bloques.length > 0 && (
                <div className="mb-2">
                    {/* Con un solo bloque no hay nada que alternar: se dibuja con su
                     *  título, como Pendientes. */}
                    {bloques.length > 1 && (
                        <div className="mb-2 flex gap-1 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-[#F6F8FC] p-1">
                            {bloques.map(({ titulo, resultado, items }) => {
                                const activo = resultado === segmento
                                // Lo tildado del otro lado queda invisible al cambiar de
                                // pestaña; el contador es lo que evita que se pierda de
                                // vista (cambiar de segmento no borra nada).
                                const tildados = items.filter(m => porId.has(m.motivoId)).length
                                return (
                                    <button
                                        key={titulo}
                                        type="button"
                                        aria-pressed={activo}
                                        onClick={() => setSegmento(resultado)}
                                        className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-sans ${
                                            activo ? 'bg-white shadow-[0_1px_2px_rgba(16,24,40,.08)]' : ''
                                        }`}
                                    >
                                        <span
                                            className={`min-w-0 truncate text-[11px] font-bold uppercase tracking-wide ${
                                                activo ? 'text-[#182645]' : 'text-[#8A93A6]'
                                            }`}
                                        >
                                            {titulo}
                                        </span>
                                        {tildados > 0 && (
                                            <span
                                                className="grid h-[17px] min-w-[17px] shrink-0 place-items-center rounded-full px-1 text-[10px] font-extrabold text-white"
                                                style={{ background: colorDeResultado(resultado).check }}
                                            >
                                                {tildados}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
                        {bloques.length === 1 && (
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                {bloques[0].titulo}
                            </span>
                        )}
                        <div className="flex flex-col gap-2">
                            {(bloques.find(b => b.resultado === segmento) ?? bloques[0]).items.map(
                                renderMotivo,
                            )}
                        </div>
                    </div>
                </div>
            )}

            {pendientes.length > 0 && (
                <div className="mb-2 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                        {TITULO_PENDIENTES}
                    </span>
                    <div className="grid grid-cols-2 gap-2">{pendientes.map(renderMotivo)}</div>
                </div>
            )}

            {otros.length > 0 && (
                <div className="flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                        {TITULO_OTROS}
                    </span>
                    <div className="grid grid-cols-2 gap-2">{otros.map(renderMotivo)}</div>
                </div>
            )}
        </div>
    )
}
