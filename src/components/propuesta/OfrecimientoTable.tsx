import { useState } from 'react'
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import { resumenAlcance } from '@/lib/alcance'
import { registroDetalleAccion } from './accionDetalle/registro'
import type { TipoOfrecimiento } from '@/types/planificacion'
import type { IOfrecimientoFila, IOfrecimientoFilaResolucion } from './filas'

interface OfrecimientoTableProps {
    filas: IOfrecimientoFila[]
    onResolucion?: (ofrecimientoId: number) => void
    onAgregar?: (codigo: string) => void
    onEliminar?: (ofrecimientoId: number) => void
    /** codes cuyas mutaciones de "agregar" están en vuelo: esas filas
     *  quedan atenuadas y deshabilitadas. Es un set (no un solo valor) porque
     *  el vendedor puede tocar varias filas agregables antes de que la
     *  primera request vuelva. Clave `` `${tipo}:${codigo}` ``: dos tipos
     *  distintos pueden compartir código. */
    agregandoCodes?: Set<string>
    /** ofrecimientoIds cuyas mutaciones de "eliminar" están en vuelo: esos
     *  botones muestran spinner y quedan deshabilitados. */
    eliminandoIds?: Set<number>
}

/** Sin acentos ni mayúsculas: nadie tipea la tilde de "BATERÍAS" parado en un mostrador
 *  (mismo criterio que `CatalogoPicker`). */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function fmtCelda(valor: number | null) {
    return valor == null ? '–' : fmtAmount(valor)
}

function cae(valor: number | null, promedio6m: number | null): boolean {
    return promedio6m != null && promedio6m > 0 && valor != null && valor < promedio6m
}

const TIPO_LABEL: Record<TipoOfrecimiento, string> = {
    rubro: 'Rubro',
    marca: 'Marca',
    linea: 'Línea',
    articulo: 'Artículo',
    accion: 'Acción',
}

// Mismo ancho fijo y el mismo padding horizontal (cero acá, todo lo aporta el
// span interno) en el header y en cada celda: si alguno de los dos tuviera un
// padding distinto, el número y la etiqueta del header dejan de coincidir en
// la misma columna aunque el `div` que los contiene mida lo mismo.
const ANCHO_NUMERICA = 'w-[54px] shrink-0'

// Slot del chip de estado, al principio de la fila. Se reserva en TODAS las filas de
// la tabla (y en el header) cuando la tabla es la de una visita: si solo lo llevaran
// las filas con `resolucion`, los nombres del bloque "otros rubros" arrancarían 26px
// más a la izquierda que los de arriba.
const ANCHO_CHIP = 'w-[26px] shrink-0'
// Ídem para el ✕ de "quitar rubro". A diferencia del chip, este solo se reserva si
// hay al menos un rubro agregado a mano — es el caso raro, y reservarlo siempre le
// come 30px al nombre en todas las visitas para nada.
const ANCHO_QUITAR = 'w-[30px] shrink-0'

function Celda({
    valor,
    promedio6m,
    referencia,
}: {
    valor: number | null
    promedio6m: number | null
    referencia?: boolean
}) {
    const rojo = !referencia && cae(valor, promedio6m)
    return (
        <div className={`${ANCHO_NUMERICA} flex justify-end`}>
            <span
                // La celda de referencia (P.6M) lleva la misma pastilla de fondo que las
                // demás — solo cambia el color de texto — porque sin ese fondo el ojo no
                // tiene con qué anclar su posición y la columna parece corrida, aunque el
                // ancho sea idéntico al de ACTUAL/M.ANT.
                className={`inline-block rounded-md px-1.5 py-0.5 lining-nums tabular-nums slashed-zero whitespace-nowrap text-[12.5px] font-semibold ${
                    referencia ? 'bg-[#F1F3F8] text-dsmuted' : rojo ? 'bg-[#FEECEC] text-dsred' : 'bg-[#F1F3F8] text-[#182645]'
                }`}
            >
                {fmtCelda(valor)}
            </span>
        </div>
    )
}

/** Estado de la resolución del ofrecimiento, en 26px: ＋ (sin cargar), el número de
 *  motivos en ámbar (empezado pero incompleto) o ✓ verde (completo). Reemplaza al
 *  botón "Resolución" de ancho completo que ocupaba una segunda línea por fila: con
 *  5 rubros esa línea costaba ~250px de una pantalla que tiene ~500 útiles. */
function ChipEstado({ resolucion }: { resolucion: IOfrecimientoFilaResolucion }) {
    const { completo, motivosCargados } = resolucion
    return (
        <div className={`${ANCHO_CHIP} flex justify-start`}>
            <span
                aria-hidden
                className={`grid h-[22px] w-[22px] place-items-center rounded-full border text-[11px] font-extrabold ${
                    completo
                        ? 'border-[#BFE6CE] bg-[#EAF7EF] text-dsgreen'
                        : motivosCargados > 0
                          ? 'border-[#F0D3A0] bg-[#FDF6EA] text-[#B45309]'
                          : // Sin cargar lleva ＋: un círculo vacío se lee como "acá no
                            // hay nada" y no invita a tocarlo. Con el ＋ (y el relleno,
                            // en vez del borde punteado) la fila se lee como el botón
                            // que efectivamente es.
                            'border-[#C9D2E3] bg-[#F1F4F9] text-dsnavy'
                }`}
            >
                {completo ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : motivosCargados > 0 ? (
                    motivosCargados
                ) : (
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                )}
            </span>
        </div>
    )
}

/** Nombre (+ chip de tipo y alcance si aplica) y las tres columnas numéricas, siempre en
 *  ese orden y con el mismo ancho de columna que el header. El chip no se pinta para
 *  'rubro': es el caso por defecto y repetirlo en cada fila es ruido. "SKF" sin decir
 *  que es una marca sí es ambiguo, y esa es la razón del chip. */
function ContenidoFila({ fila }: { fila: IOfrecimientoFila }) {
    const moduloDetalle = registroDetalleAccion[fila.codigo]
    return (
        <>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#182645]">{fila.nombre}</span>
                    {fila.tipo !== 'rubro' && (
                        <span className="shrink-0 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[10px] font-bold text-[#213D82]">
                            {TIPO_LABEL[fila.tipo]}
                        </span>
                    )}
                </div>
                {fila.alcance.length > 0 && (
                    <div className="truncate text-[11px] font-semibold text-dsmuted">
                        {resumenAlcance(fila.alcance)}
                    </div>
                )}
                {fila.detalle != null && moduloDetalle && (
                    <div className="truncate text-[11px] font-semibold text-dsmuted">
                        {moduloDetalle.resumen(fila.detalle)}
                    </div>
                )}
            </div>
            {/* Una acción (Plan cupo, Descuento) no tiene venta histórica por rubro —
             *  mostrar las tres celdas en guiones se lee como "falta cargar" cuando en
             *  realidad ese dato no existe para este tipo de ofrecimiento. */}
            {fila.tipo !== 'accion' && (
                <>
                    <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
                    <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} />
                    <Celda valor={fila.promedio6m} promedio6m={fila.promedio6m} referencia />
                </>
            )}
        </>
    )
}

/** Una fila completa, siempre de UNA sola línea. Las tres variantes (read-only,
 *  resoluble, agregable) comparten la misma altura y las mismas columnas — lo único
 *  que cambia es qué pasa al tocarla y qué muestra el chip del principio. */
function FilaOfrecimiento({
    fila,
    conBorde,
    conChip,
    conColumnaQuitar,
    onResolucion,
    onAgregar,
    onEliminar,
    agregandoCodes,
    eliminandoIds,
}: {
    fila: IOfrecimientoFila
    conBorde: boolean
    conChip: boolean
    conColumnaQuitar: boolean
    onResolucion?: (ofrecimientoId: number) => void
    onAgregar?: (codigo: string) => void
    onEliminar?: (ofrecimientoId: number) => void
    agregandoCodes?: Set<string>
    eliminandoIds?: Set<number>
}) {
    const resolucion = fila.resolucion
    const agregando = fila.agregable ? (agregandoCodes?.has(`${fila.tipo}:${fila.codigo}`) ?? false) : false
    const eliminando = resolucion ? (eliminandoIds?.has(resolucion.ofrecimientoId) ?? false) : false
    const clasesFila = 'flex min-w-0 flex-1 items-center gap-1 px-2.5 py-2 text-left'

    const interior = (
        <>
            {conChip &&
                (resolucion ? <ChipEstado resolucion={resolucion} /> : <div className={ANCHO_CHIP} />)}
            <ContenidoFila fila={fila} />
        </>
    )

    return (
        <div className={`flex items-center ${conBorde ? 'border-b border-dsline' : ''}`}>
            {resolucion || fila.agregable ? (
                <button
                    type="button"
                    aria-label={
                        resolucion ? `Resolución de ${fila.nombre}` : `Agregar ${fila.nombre}`
                    }
                    disabled={agregando}
                    onClick={() =>
                        resolucion
                            ? onResolucion?.(resolucion.ofrecimientoId)
                            : onAgregar?.(fila.codigo)
                    }
                    className={`${clasesFila} active:bg-[#F7F8FB] disabled:opacity-50`}
                >
                    {interior}
                </button>
            ) : (
                <div className={clasesFila}>{interior}</div>
            )}
            {/* Solo para ofrecimientos agregados dinámicamente — los de la propuesta
             *  congelada no se pueden borrar (el backend responde
             *  OFRECIMIENTO_DE_PROPUESTA); si el vendedor no lo ofreció, se resuelve
             *  con "No lo ofrecí" en vez de borrarlo. La columna se reserva en toda la
             *  tabla (ver ANCHO_QUITAR) para que las filas sin ✕ no corran sus números. */}
            {conColumnaQuitar && (
                <div className={`${ANCHO_QUITAR} flex justify-center`}>
                    {resolucion && !resolucion.esPropuesto && (
                        <button
                            type="button"
                            aria-label={`Quitar ${fila.nombre}`}
                            onClick={() => onEliminar?.(resolucion.ofrecimientoId)}
                            disabled={eliminando}
                            className="grid h-7 w-7 place-items-center rounded-md text-dsred disabled:opacity-50"
                        >
                            {eliminando ? (
                                <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2.4} />
                            ) : (
                                <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

/** Lista RUBRO · ACTUAL · M.ANT · P.6M compartida por la propuesta y la visita.
 *  Presentacional pura: no conoce visitas ni mutaciones, solo `filas` (ver
 *  `filas.ts`) y callbacks. El buscador es la única excepción a "pura": es un
 *  filtro puramente visual sobre lo que ya llegó por props, no dispara ningún
 *  fetch ni mutación.
 *
 *  Todas las filas miden una sola línea, sean resolubles, agregables o de solo
 *  lectura: toda la fila es el target táctil y el estado se lee del chip del
 *  principio (`ChipEstado`). Antes una fila con `resolucion` era una tarjeta de
 *  dos pisos con un botón "Resolución" de ancho completo abajo — ~98px por
 *  rubro, contra ~40px ahora: en un celular eso dejaba ver menos de dos rubros
 *  de los cinco que hay que resolver antes de poder cerrar la visita.
 *
 *  El buscador solo filtra "otros rubros del cliente": esa es la lista que
 *  puede crecer a docenas de filas (todo el historial de compra del
 *  cliente), mientras que el bloque de arriba (la propuesta, o los
 *  ofrecimientos ya cargados en la visita) es corto y es justamente lo que
 *  el vendedor tiene que ver siempre — filtrarlo escondería el trabajo
 *  pendiente detrás de una búsqueda que no viene al caso ahí. */
export default function OfrecimientoTable({
    filas,
    onResolucion,
    onAgregar,
    onEliminar,
    agregandoCodes,
    eliminandoIds,
}: OfrecimientoTableProps) {
    const [busqueda, setBusqueda] = useState('')

    // Se filtra por `destacada` en vez de asumir que `filas` viene ordenada
    // destacadas-primero: `construirFilas*` hoy respeta ese orden, pero
    // derivarlo así evita que un bloque de arriba vacío (o desordenado) se
    // confunda con "no hay bloque extra".
    const bloqueArriba = filas.filter(f => f.destacada)
    const bloqueAbajo = filas.filter(f => !f.destacada)
    const hayBloqueExtra = bloqueAbajo.length > 0
    const bloqueExtraEsAgregable = bloqueAbajo.some(f => f.agregable)
    // Tabla de una visita ⇒ hay chip de estado, y se reserva su ancho en todas las
    // filas y en el header. En la propuesta (ninguna fila resoluble) no se reserva
    // nada: ahí ese espacio es ancho de nombre.
    const conChip = filas.some(f => f.resolucion)
    const conColumnaQuitar = filas.some(f => f.resolucion && !f.resolucion.esPropuesto)

    const q = normalizar(busqueda.trim())
    const bloqueAbajoFiltrado = q === '' ? bloqueAbajo : bloqueAbajo.filter(f => normalizar(f.nombre).includes(q))

    return (
        // Sin `overflow-hidden`: recortaba las esquinas del header, pero un ancestro con
        // overflow oculto anula el `position: sticky` de adentro contra el scroll del
        // sheet. Las esquinas de arriba las redondea el propio header.
        <div className="w-full rounded-xl border border-dsline">
            {/* Sticky: con el catálogo abierto la lista pasa de 25 filas y, sin el rótulo
                a la vista, las tres columnas de números quedan sin identificar apenas se
                scrollea (ACTUAL vs. M.ANT vs. P.6M no se adivinan por el valor). */}
            <div className="sticky top-0 z-20 flex h-8 items-center gap-1 rounded-t-[11px] border-b border-dsline bg-[#F7F8FB] px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                {conChip && <div className={ANCHO_CHIP} />}
                <div role="columnheader" className="min-w-0 flex-1">
                    Rubro
                </div>
                {/* pr-1.5: el número de datos vive dentro de una pastilla con ese mismo
                    padding interno — sin este ajuste, la etiqueta del header queda pegada
                    al borde de la columna mientras el dígito de abajo queda 6px más
                    adentro, y el desfasaje se nota más cuanto más corta es la palabra
                    (por eso "P.6M" se ve más corrido que "M.Ant"). */}
                <div role="columnheader" className={`${ANCHO_NUMERICA} pr-1.5 text-right`}>
                    Actual
                </div>
                <div role="columnheader" className={`${ANCHO_NUMERICA} pr-1.5 text-right`}>
                    M.Ant
                </div>
                <div role="columnheader" className={`${ANCHO_NUMERICA} pr-1.5 text-right`}>
                    P.6M
                </div>
                {conColumnaQuitar && <div className={ANCHO_QUITAR} />}
            </div>

            <div>
                {bloqueArriba.map((fila, i) => (
                    <FilaOfrecimiento
                        key={`${fila.tipo}:${fila.codigo}`}
                        fila={fila}
                        // La última no lleva borde propio cuando sigue la banda: la banda
                        // ya trae el suyo arriba (border-y, que necesita para no dejar
                        // pasar filas por abajo mientras está sticky).
                        conBorde={i < bloqueArriba.length - 1}
                        conChip={conChip}
                        conColumnaQuitar={conColumnaQuitar}
                        onResolucion={onResolucion}
                        onAgregar={onAgregar}
                        onEliminar={onEliminar}
                        agregandoCodes={agregandoCodes}
                        eliminandoIds={eliminandoIds}
                    />
                ))}

                {hayBloqueExtra && (
                    // Sticky debajo del header de columnas (top-8 = su alto): el buscador
                    // es lo único que hace manejable una lista de decenas de rubros, y si
                    // scrollea con ella hay que volver hasta arriba para usarlo — que es
                    // justo lo que uno quiere evitar cuando ya scrolleó mucho.
                    <div className="sticky top-8 z-10 border-y border-dsline bg-[#FAFBFD] px-2.5 py-2">
                        <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                            Otros rubros del cliente
                            {bloqueExtraEsAgregable && ' · tocá uno para agregarlo'}
                        </p>
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A93A6]"
                                strokeWidth={2.4}
                            />
                            <input
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar rubro…"
                                aria-label="Buscar rubro"
                                className="h-8 w-full rounded-md border border-[#E4E8F0] bg-white pl-8 pr-2.5 text-[12.5px] font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy"
                            />
                        </div>
                    </div>
                )}

                {bloqueAbajoFiltrado.map((fila, i) => (
                    <FilaOfrecimiento
                        key={`${fila.tipo}:${fila.codigo}`}
                        fila={fila}
                        conBorde={i < bloqueAbajoFiltrado.length - 1}
                        conChip={conChip}
                        conColumnaQuitar={conColumnaQuitar}
                        onResolucion={onResolucion}
                        onAgregar={onAgregar}
                        onEliminar={onEliminar}
                        agregandoCodes={agregandoCodes}
                        eliminandoIds={eliminandoIds}
                    />
                ))}

                {hayBloqueExtra && q !== '' && bloqueAbajoFiltrado.length === 0 && (
                    <div className="px-2.5 py-4 text-center text-[12px] text-dsmuted">
                        Sin resultados para "{busqueda}"
                    </div>
                )}
            </div>
        </div>
    )
}
