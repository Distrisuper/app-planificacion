import { useState } from 'react'
import { Check } from 'lucide-react'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'
import { registroDetalleMotivo } from './detalleMotivo/registro'
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

    // Qué lado del segmentado se está viendo. Arranca donde ya hay carga (al retomar un
    // borrador, abrir en Objeción cuando lo tildado es un Cierre obligaría a buscarlo);
    // si no hay nada tildado, en Objeción. Es estado inicial y no un efecto: cambiar de
    // segmento después es del vendedor, no algo que se recalcule solo.
    const [segmento, setSegmento] = useState<ResultadoMotivo>(() =>
        value.some(m => resultadoPorId.get(m.motivoId) === 'ganado') ? 'ganado' : 'perdido',
    )

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
        onChange([...compatibles, { motivoId, valores: {} }])
    }

    /** El módulo manda solo los campos que tocó; acá se mergean con lo que ya tenía ese
     *  motivo. Así un Editor no necesita conocer el resto del formulario. */
    function setValores(motivoId: number, parcial: Record<string, string | number | null>) {
        onChange(
            value.map(m =>
                m.motivoId !== motivoId ? m : { ...m, valores: { ...m.valores, ...parcial } },
            ),
        )
    }

    function renderMotivo(cat: IMotivo) {
        const seleccionado = porId.get(cat.motivoId)
        const on = !!seleccionado
        const color = colorDeResultado(cat.resultado)
        // Un codigo sin módulo registrado (catálogo por delante del deploy) dibuja el motivo
        // sin detalle en vez de romper la pantalla.
        const Editor = cat.codigo ? registroDetalleMotivo[cat.codigo] : undefined
        return (
            <div
                key={cat.motivoId}
                className={`flex flex-col gap-0 ${Editor && on ? 'col-span-2' : ''}`}
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

                {on && Editor && (
                    <div
                        className="animate-panel-in ml-8 mt-2 mb-0.5 rounded-[10px] border-[1.5px] bg-white p-2.5"
                        style={{ borderColor: color.border }}
                    >
                        <Editor
                            valores={seleccionado!.valores}
                            onChange={parcial => setValores(cat.motivoId, parcial)}
                            marcas={marcas}
                            marcasLoading={marcasLoading}
                        />
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

    // El bloque que se está viendo. `segmento` es la INTENCIÓN del vendedor; esto es lo
    // que efectivamente se dibuja, que puede diferir si ese bloque quedó vacío (catálogo
    // a medio migrar). Derivarlo una sola vez evita que el cuerpo y los Pendientes
    // discrepen sobre cuál está activo.
    const bloqueActivo = bloques.find(b => b.resultado === segmento) ?? bloques[0]

    // Los pendientes acompañan a la objeción, así que se muestran con ella. Sin ningún
    // bloque (un catálogo que solo tiene diferidos) no hay nada con qué entrar en
    // conflicto: se muestran solos.
    const muestraPendientes =
        pendientes.length > 0 && (bloques.length === 0 || bloqueActivo?.resultado === 'perdido')

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
                                const activo = resultado === bloqueActivo?.resultado
                                // Lo tildado del otro lado queda invisible al cambiar de
                                // pestaña; el contador es lo que evita que se pierda de
                                // vista (cambiar de segmento no borra nada). Objeción
                                // suma los pendientes porque se esconden con ella — si no,
                                // un Cupo tildado quedaría invisible Y sin contar.
                                const propios = resultado === 'perdido' ? [...items, ...pendientes] : items
                                const tildados = propios.filter(m => porId.has(m.motivoId)).length
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
                            {bloqueActivo.items.map(renderMotivo)}
                        </div>
                    </div>
                </div>
            )}

            {/* Solo con Objeción: un pendiente acompaña a una objeción y NO convive con
             *  un cierre. Ofrecerlo en el segmento Cierre sería un tilde que borra lo que
             *  el vendedor acaba de cargar. La regla igual vive en `conviven` — esto la
             *  hace difícil de alcanzar, no innecesaria. */}
            {muestraPendientes && (
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
