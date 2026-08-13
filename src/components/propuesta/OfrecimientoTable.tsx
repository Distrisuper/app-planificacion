import { useState } from 'react'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import { resumenAlcance } from '@/lib/alcance'
import type { TipoOfrecimiento } from '@/types/planificacion'
import type { IOfrecimientoFila } from './filas'

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

/** Nombre (+ chip de tipo y alcance si aplica) y las tres columnas numéricas, siempre en
 *  ese orden y con el mismo ancho de columna que el header, en las dos únicas variantes
 *  que existen: read-only (`div`) o agregable (`button`, toda la fila es el target
 *  táctil). Ninguna variante agrega una columna extra al final — por eso el ancho de
 *  ACTUAL/M.ANT/P.6M es siempre el mismo, sea esta fila una tarjeta con Resolución
 *  arriba, una fila de solo lectura, o una fila agregable. */
function ContenidoFila({ fila }: { fila: IOfrecimientoFila }) {
    // El chip no se pinta para 'rubro': es el caso por defecto y repetirlo en cada fila
    // es ruido. "SKF" sin decir que es una marca sí es ambiguo, y esa es la razón del chip.
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
            </div>
            <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
            <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} />
            <Celda valor={fila.promedio6m} promedio6m={fila.promedio6m} referencia />
        </>
    )
}

function FilaDatos({
    fila,
    onAgregar,
    agregandoCodes,
    conBorde,
}: {
    fila: IOfrecimientoFila
    onAgregar?: (codigo: string) => void
    agregandoCodes?: Set<string>
    conBorde: boolean
}) {
    const clasesFila = `flex w-full items-center gap-1 px-2.5 py-2.5 text-left ${conBorde ? 'border-b border-dsline' : ''}`

    if (fila.agregable) {
        const agregando = agregandoCodes?.has(`${fila.tipo}:${fila.codigo}`) ?? false
        return (
            <button
                type="button"
                aria-label={`Agregar ${fila.nombre}`}
                disabled={agregando}
                onClick={() => onAgregar?.(fila.codigo)}
                className={`${clasesFila} active:bg-[#F7F8FB] disabled:opacity-50`}
            >
                <ContenidoFila fila={fila} />
            </button>
        )
    }

    return (
        <div className={clasesFila}>
            <ContenidoFila fila={fila} />
        </div>
    )
}

/** Una fila completa: la tarjeta con Resolución/Quitar si `fila.resolucion`
 *  está presente, o la fila lisa (read-only o agregable) si no. */
function FilaOfrecimiento({
    fila,
    conBorde,
    onResolucion,
    onAgregar,
    onEliminar,
    agregandoCodes,
    eliminandoIds,
}: {
    fila: IOfrecimientoFila
    conBorde: boolean
    onResolucion?: (ofrecimientoId: number) => void
    onAgregar?: (codigo: string) => void
    onEliminar?: (ofrecimientoId: number) => void
    agregandoCodes?: Set<string>
    eliminandoIds?: Set<number>
}) {
    if (!fila.resolucion) {
        return <FilaDatos fila={fila} onAgregar={onAgregar} agregandoCodes={agregandoCodes} conBorde={conBorde} />
    }

    return (
        <div className="px-2 py-1.5">
            <div className="rounded-xl border border-dsline">
                <FilaDatos fila={fila} conBorde={false} />
                <div className="flex items-center gap-2 px-2.5 pb-2.5">
                    <button
                        type="button"
                        aria-label={`Resolución de ${fila.nombre}`}
                        onClick={() => onResolucion?.(fila.resolucion!.ofrecimientoId)}
                        className={`h-9 flex-1 rounded-lg border text-[12px] font-bold ${
                            fila.resolucion.completo
                                ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
                                : 'border-[#D8DEEA] text-dsnavy'
                        }`}
                    >
                        {fila.resolucion.completo
                            ? `✓ ${fila.resolucion.motivosCargados} ${fila.resolucion.motivosCargados === 1 ? 'motivo' : 'motivos'} cargado${fila.resolucion.motivosCargados === 1 ? '' : 's'}`
                            : 'Resolución'}
                    </button>
                    {/* Solo para ofrecimientos agregados dinámicamente — los de la propuesta
                     *  congelada no se pueden borrar (el backend responde
                     *  OFRECIMIENTO_DE_PROPUESTA); si el vendedor no lo ofreció, se resuelve
                     *  con "No lo ofrecí" en vez de borrarlo. */}
                    {!fila.resolucion.esPropuesto && (
                        <button
                            type="button"
                            aria-label={`Quitar ${fila.nombre}`}
                            onClick={() => onEliminar?.(fila.resolucion!.ofrecimientoId)}
                            disabled={eliminandoIds?.has(fila.resolucion.ofrecimientoId) ?? false}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#EAD3D3] text-dsred disabled:opacity-50"
                        >
                            {eliminandoIds?.has(fila.resolucion.ofrecimientoId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                            ) : (
                                <Trash2 className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

/** Lista RUBRO · ACTUAL · M.ANT · P.6M compartida por la propuesta y la visita.
 *  Presentacional pura: no conoce visitas ni mutaciones, solo `filas` (ver
 *  `filas.ts`) y callbacks. El buscador es la única excepción a "pura": es un
 *  filtro puramente visual sobre lo que ya llegó por props, no dispara ningún
 *  fetch ni mutación.
 *
 *  Una fila con `resolucion` se agrupa con su botón en una tarjeta propia
 *  (nombre+valores arriba, acción abajo, con su propio borde): es la unidad
 *  que el vendedor toca para resolver ese ofrecimiento. Una fila `agregable` no
 *  tiene ningún ícono al costado — toda la fila es el botón — porque con
 *  varios rubros candidatos (ver "otros rubros del cliente") convertir cada
 *  uno en su propia tarjeta duplicaría la altura de una lista que ya puede
 *  ser larga, y un ícono aparte reservaba una columna que desalineaba el
 *  resto de la tabla. Sin `resolucion` ni `agregable` (la propuesta de solo
 *  lectura) se ve como una fila de tabla común.
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

    const q = normalizar(busqueda.trim())
    const bloqueAbajoFiltrado = q === '' ? bloqueAbajo : bloqueAbajo.filter(f => normalizar(f.nombre).includes(q))

    return (
        <div className="w-full overflow-hidden rounded-xl border border-dsline">
            <div className="flex items-center gap-1 border-b border-dsline bg-[#F7F8FB] px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
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
            </div>

            <div>
                {bloqueArriba.map((fila, i) => (
                    <FilaOfrecimiento
                        key={`${fila.tipo}:${fila.codigo}`}
                        fila={fila}
                        conBorde={i < bloqueArriba.length - 1 || hayBloqueExtra}
                        onResolucion={onResolucion}
                        onAgregar={onAgregar}
                        onEliminar={onEliminar}
                        agregandoCodes={agregandoCodes}
                        eliminandoIds={eliminandoIds}
                    />
                ))}

                {hayBloqueExtra && (
                    <div className="border-t border-dsline bg-[#FAFBFD] px-2.5 py-2">
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
