import { Loader2, Trash2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import type { IRubroFila } from './filas'

interface RubroTableProps {
    filas: IRubroFila[]
    onResolucion?: (visitaRubroId: number) => void
    onAgregar?: (rubroCode: string) => void
    onEliminar?: (visitaRubroId: number) => void
    /** rubroCode cuya mutación de "agregar" está en vuelo: esa fila queda
     *  atenuada y deshabilitada. */
    agregandoCode?: string | null
    /** visitaRubroId cuya mutación de "eliminar" está en vuelo: ese botón
     *  muestra spinner y queda deshabilitado. */
    eliminandoId?: number | null
}

function fmtCelda(valor: number | null) {
    return valor == null ? '–' : fmtAmount(valor)
}

function cae(valor: number | null, promedio6m: number | null): boolean {
    return promedio6m != null && promedio6m > 0 && valor != null && valor < promedio6m
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

/** Nombre + las tres columnas numéricas, siempre en ese orden y con el mismo
 *  ancho de columna que el header, en las dos únicas variantes que existen:
 *  read-only (`div`) o agregable (`button`, toda la fila es el target táctil).
 *  Ninguna variante agrega una columna extra al final — por eso el ancho de
 *  ACTUAL/M.ANT/P.6M es siempre el mismo, sea esta fila una tarjeta con
 *  Resolución arriba, una fila de solo lectura, o una fila agregable. */
function ContenidoFila({ fila }: { fila: IRubroFila }) {
    return (
        <>
            <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#182645]">{fila.nombre}</div>
            <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
            <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} />
            <Celda valor={fila.promedio6m} promedio6m={fila.promedio6m} referencia />
        </>
    )
}

function FilaDatos({
    fila,
    onAgregar,
    agregandoCode,
    conBorde,
}: {
    fila: IRubroFila
    onAgregar?: (rubroCode: string) => void
    agregandoCode?: string | null
    conBorde: boolean
}) {
    const clasesFila = `flex w-full items-center gap-1 px-2.5 py-2.5 text-left ${conBorde ? 'border-b border-dsline' : ''}`

    if (fila.agregable) {
        const agregando = agregandoCode === fila.rubroCode
        return (
            <button
                type="button"
                aria-label={`Agregar ${fila.nombre}`}
                disabled={agregando}
                onClick={() => onAgregar?.(fila.rubroCode)}
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

/** Lista RUBRO · ACTUAL · M.ANT · P.6M compartida por la propuesta y la visita.
 *  Presentacional pura: no conoce visitas ni mutaciones, solo `filas` (ver
 *  `filas.ts`) y callbacks.
 *
 *  Una fila con `resolucion` se agrupa con su botón en una tarjeta propia
 *  (nombre+valores arriba, acción abajo, con su propio borde): es la unidad
 *  que el vendedor toca para resolver ese rubro. Una fila `agregable` no
 *  tiene ningún ícono al costado — toda la fila es el botón — porque con
 *  varios rubros candidatos (ver "otros rubros del cliente") convertir cada
 *  uno en su propia tarjeta duplicaría la altura de una lista que ya puede
 *  ser larga, y un ícono aparte reservaba una columna que desalineaba el
 *  resto de la tabla. Sin `resolucion` ni `agregable` (la propuesta de solo
 *  lectura) se ve como una fila de tabla común. */
export default function RubroTable({
    filas,
    onResolucion,
    onAgregar,
    onEliminar,
    agregandoCode,
    eliminandoId,
}: RubroTableProps) {
    const primerIndexNoDestacado = filas.findIndex(f => !f.destacada)
    const hayBloqueExtra = primerIndexNoDestacado > 0
    const bloqueExtraEsAgregable = hayBloqueExtra && filas.slice(primerIndexNoDestacado).some(f => f.agregable)

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
                {filas.map((fila, i) => {
                    const mostrarSeparador = hayBloqueExtra && i === primerIndexNoDestacado
                    const esUltima = i === filas.length - 1

                    return (
                        <div key={fila.rubroCode}>
                            {mostrarSeparador && (
                                <div className="border-t border-dsline bg-[#FAFBFD] px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                                    Otros rubros del cliente
                                    {bloqueExtraEsAgregable && ' · tocá uno para agregarlo'}
                                </div>
                            )}
                            {fila.resolucion ? (
                                <div className="px-2 py-1.5">
                                    <div className="rounded-xl border border-dsline">
                                        <FilaDatos fila={fila} conBorde={false} />
                                        <div className="flex items-center gap-2 px-2.5 pb-2.5">
                                            <button
                                                type="button"
                                                aria-label={`Resolución de ${fila.nombre}`}
                                                onClick={() => onResolucion?.(fila.resolucion!.visitaRubroId)}
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
                                            {/* Solo para rubros agregados dinámicamente — los de la propuesta
                                             *  congelada no se pueden borrar (el backend responde
                                             *  RUBRO_DE_PROPUESTA); si el vendedor no lo ofreció, se resuelve
                                             *  con "No lo ofrecí" en vez de borrarlo. */}
                                            {!fila.resolucion.esPropuesto && (
                                                <button
                                                    type="button"
                                                    aria-label={`Quitar ${fila.nombre}`}
                                                    onClick={() => onEliminar?.(fila.resolucion!.visitaRubroId)}
                                                    disabled={eliminandoId === fila.resolucion.visitaRubroId}
                                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#EAD3D3] text-dsred disabled:opacity-50"
                                                >
                                                    {eliminandoId === fila.resolucion.visitaRubroId ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <FilaDatos
                                    fila={fila}
                                    onAgregar={onAgregar}
                                    agregandoCode={agregandoCode}
                                    conBorde={!esUltima}
                                />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
