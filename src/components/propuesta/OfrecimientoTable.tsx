import { useState } from 'react'
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import { resumenAlcance } from '@/lib/alcance'
import { registroDetalleAccion } from './accionDetalle/registro'
import { separarSegmentos } from './filas'
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
// M.ANT es la unica de las tres columnas numericas que se esconde abajo de 360px: es la
// menos cargada de las tres (la propuesta se arma comparando ACTUAL contra P.6M, no
// contra el mes anterior), y esos 54px son la diferencia entre leer "PARRILLAS, BRAZ..."
// y leer el nombre del rubro completo.
//
// Son dos clases y no una porque el header es `block` (alinea con text-right) y la celda
// es `flex` (alinea con justify-end): meterle `flex` al header haria que su texto pase a
// ser un item flex y text-right deje de tener efecto. Van siempre de la mano — si solo
// una de las dos se escondiera, las columnas quedarian corridas entre si.
const OCULTA_ANGOSTO_CELDA = 'hidden xs:flex'
const OCULTA_ANGOSTO_HEADER = 'hidden xs:block'

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
    ocultaEnAngosto,
}: {
    valor: number | null
    promedio6m: number | null
    referencia?: boolean
    /** true = la columna desaparece abajo de 360px. Tiene que ir junto con el mismo flag
     *  en su header (ver OCULTA_ANGOSTO_CELDA). */
    ocultaEnAngosto?: boolean
}) {
    const rojo = !referencia && cae(valor, promedio6m)
    return (
        <div
            className={`${ANCHO_NUMERICA} justify-end ${
                ocultaEnAngosto ? OCULTA_ANGOSTO_CELDA : 'flex'
            }`}
        >
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

/** Estado de la resolución del ofrecimiento, en 26px: anillo hueco (sin cargar), el
 *  número de motivos en ámbar (empezado pero incompleto) o un check verde (completo).
 *  Reemplaza al botón "Resolución" de ancho completo que ocupaba una segunda línea por
 *  fila: con 5 rubros esa línea costaba ~250px de una pantalla que tiene ~500 útiles.
 *
 *  Los tres estados son un CHECKLIST — pendiente, parcial, completo — y por eso el
 *  pendiente es un anillo hueco y NO un ＋ (que es lo que tuvo un rato).
 *  `＋` significa "agregar algo nuevo", y acá el rubro ya existe: viene de
 *  la propuesta congelada y lo que se hace es registrar su resultado. Peor: en ESTA misma
 *  tabla "agregar" ya es una acción distinta y real (las filas de "Otros rubros del
 *  cliente · tocá uno para agregarlo"), así que el ＋ quedaba pegado al
 *  verbo equivocado: en las filas que hay que completar, mientras las que sí agregan no
 *  llevan ícono. El contraparte natural de un check es una casilla sin tildar. */
function ChipEstado({ resolucion }: { resolucion: IOfrecimientoFilaResolucion }) {
    const { completo, motivosCargados } = resolucion
    return (
        <div className={`${ANCHO_CHIP} flex justify-start`}>
            <span
                aria-hidden
                // 24px para el pendiente y 22 para los resueltos: el que hay que tocar
                // gana los 2px. Entra en `ANCHO_CHIP` (26px) sin correr ninguna columna.
                className={`grid place-items-center rounded-full border text-[11px] font-extrabold ${
                    completo || motivosCargados > 0 ? 'h-[22px] w-[22px]' : 'h-6 w-6'
                } ${
                    completo
                        ? 'border-[#BFE6CE] bg-[#EAF7EF] text-dsgreen'
                        : motivosCargados > 0
                          ? 'border-[#F0D3A0] bg-[#FDF6EA] text-[#B45309]'
                          : // Anillo navy de 2px sobre blanco: una casilla sin tildar.
                            //
                            // El hairline `#C9D2E3` que tenía originalmente era gris sobre
                            // gris y se leía como decoración: de ahí venía que el vendedor
                            // viera "Cargá 2 rubros más" en el pie sin nada que le dijera
                            // por dónde. El anillo navy conserva toda esa visibilidad.
                            //
                            // Y no hace falta que además invite a tocarlo (lo que había
                            // motivado el ＋, y despues el navy relleno): el
                            // gesto ahora está escrito en la banda de arriba, "tocá uno
                            // para cargar el resultado". Con la instrucción presente, el
                            // chip puede volver a ser lo único que tiene que ser: un
                            // indicador de estado.
                            'border-2 border-dsnavy bg-white'
                }`}
            >
                {completo ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : motivosCargados > 0 ? (
                    motivosCargados
                ) : null}
            </span>
        </div>
    )
}

/** El ＋ de una fila agregable, en el mismo slot de 26px que `ChipEstado` y centrado
 *  sobre el mismo eje que sus círculos.
 *
 *  Este SÍ es el lugar del ＋: tocar esta fila **agrega** el rubro a la visita. Es la
 *  contracara del chip de arriba — ahí el rubro ya existe y lo que se carga es su
 *  resultado, y por eso ese es un anillo y no un ＋ (ver `ChipEstado`).
 *
 *  Y va a propósito **más discreto**: glifo pelado en gris, sin círculo ni borde, contra
 *  el anillo navy de arriba. Son dos jerarquías distintas — cargar el resultado es
 *  trabajo pendiente (bloquea el cierre), agregar un rubro es opcional — y las formas
 *  distintas (círculo vs. glifo suelto) evitan que se lean como el mismo control. */
function ChipAgregar() {
    return (
        <div className={`${ANCHO_CHIP} flex justify-start`}>
            {/* El wrapper de 24px es el que alinea: sin él, un glifo de 15px con
                `justify-start` queda ~5px a la izquierda del centro de los círculos y las
                dos mitades de la tabla dejan de compartir eje. */}
            <span aria-hidden className="grid h-6 w-6 place-items-center">
                <Plus className="h-[15px] w-[15px] text-[#8A93A6]" strokeWidth={2.5} />
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
            {/* `rubroStatus` (de donde salen estos tres números) está indexado por
             *  código de RUBRO — una acción o una marca nunca matchean ahí, así que
             *  mostrar las tres celdas en guiones se lee como "falta cargar" cuando en
             *  realidad ese dato no existe para estos tipos de ofrecimiento. */}
            {fila.tipo === 'rubro' && (
                <>
                    <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
                    <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} ocultaEnAngosto />
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
                (resolucion ? (
                    <ChipEstado resolucion={resolucion} />
                ) : fila.agregable ? (
                    <ChipAgregar />
                ) : (
                    <div className={ANCHO_CHIP} />
                ))}
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

/** Un segmento propio (Acciones, Marcas) arriba de la tabla de rubros: mismo
 *  componente de fila de una línea, pero con su propia grilla de chip/columna-quitar
 *  y su propia etiqueta — no comparte contenedor con la tabla RUBRO·ACTUAL·M.ANT·P.6M
 *  porque ninguna fila de un segmento tiene esos tres números. Sin filas, no
 *  renderiza nada (ni etiqueta vacía). */
function SegmentoOfrecimientos({
    titulo,
    filas,
    onResolucion,
    onAgregar,
    onEliminar,
    agregandoCodes,
    eliminandoIds,
}: {
    titulo: string
    filas: IOfrecimientoFila[]
    onResolucion?: (ofrecimientoId: number) => void
    onAgregar?: (codigo: string) => void
    onEliminar?: (ofrecimientoId: number) => void
    agregandoCodes?: Set<string>
    eliminandoIds?: Set<number>
}) {
    if (filas.length === 0) return null

    const conChip = filas.some(f => f.resolucion || f.agregable)
    const conColumnaQuitar = filas.some(f => f.resolucion && !f.resolucion.esPropuesto)

    return (
        <div className="mb-2">
            <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                {titulo}
            </p>
            <div className="w-full rounded-xl border border-dsline">
                {filas.map((fila, i) => (
                    <FilaOfrecimiento
                        key={`${fila.tipo}:${fila.codigo}`}
                        fila={fila}
                        conBorde={i < filas.length - 1}
                        conChip={conChip}
                        conColumnaQuitar={conColumnaQuitar}
                        onResolucion={onResolucion}
                        onAgregar={onAgregar}
                        onEliminar={onEliminar}
                        agregandoCodes={agregandoCodes}
                        eliminandoIds={eliminandoIds}
                    />
                ))}
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

    // Ninguna acción ni marca tiene venta histórica por rubro: cada una vive en su
    // propia sección, arriba de todo, afuera de la tabla RUBRO·ACTUAL·M.ANT·P.6M — el
    // resto de esta función sigue operando igual que siempre, pero solo sobre `resto`.
    const { acciones, marcas, resto } = separarSegmentos(filas)

    // Se filtra por `destacada` en vez de asumir que `resto` viene ordenado
    // destacadas-primero: `construirFilas*` hoy respeta ese orden, pero
    // derivarlo así evita que un bloque de arriba vacío (o desordenado) se
    // confunda con "no hay bloque extra".
    const bloqueArriba = resto.filter(f => f.destacada)
    const bloqueAbajo = resto.filter(f => !f.destacada)
    const hayBloqueExtra = bloqueAbajo.length > 0
    const bloqueExtraEsAgregable = bloqueAbajo.some(f => f.agregable)
    // Tabla de una visita ⇒ hay chip de estado, y se reserva su ancho en todas las
    // filas y en el header. En la propuesta (ninguna fila resoluble) no se reserva
    // nada: ahí ese espacio es ancho de nombre.
    // `|| f.agregable`: el slot tambien hace falta cuando la visita todavia no tiene
    // ningun ofrecimiento y lo unico que hay son filas del catalogo — sin esto no habria
    // donde dibujarles el ＋. En la propuesta previa sigue en false (ninguna de sus filas
    // es resoluble ni agregable) y ese espacio sigue siendo ancho de nombre.
    const conChip = resto.some(f => f.resolucion || f.agregable)
    const conColumnaQuitar = resto.some(f => f.resolucion && !f.resolucion.esPropuesto)

    const q = normalizar(busqueda.trim())
    const bloqueAbajoFiltrado = q === '' ? bloqueAbajo : bloqueAbajo.filter(f => normalizar(f.nombre).includes(q))

    return (
        <>
        <SegmentoOfrecimientos
            titulo="Acciones"
            filas={acciones}
            onResolucion={onResolucion}
            onAgregar={onAgregar}
            onEliminar={onEliminar}
            agregandoCodes={agregandoCodes}
            eliminandoIds={eliminandoIds}
        />
        <SegmentoOfrecimientos
            titulo="Marcas"
            filas={marcas}
            onResolucion={onResolucion}
            onAgregar={onAgregar}
            onEliminar={onEliminar}
            agregandoCodes={agregandoCodes}
            eliminandoIds={eliminandoIds}
        />
        {/* La gemela de "Otros rubros del cliente · tocá uno para agregarlo": dos bandas,
            misma gramática, verbos opuestos — arriba se CARGA el resultado, abajo se
            AGREGA un rubro. Ese contraste es lo que hace que la pantalla se explique sola,
            y reemplaza al párrafo de tres líneas que vivía arriba del sheet (~54px contra
            ~18px de esto).

            De ancho completo y no dentro del header de columnas porque ahí no entra (ver
            la nota del `columnheader`). Estática y no sticky a propósito: el bloque de
            arriba son ~5 filas pegadas a esta banda, así que mientras el vendedor lo está
            mirando la banda está a la vista igual. Scrolleado más abajo ya está en el
            catálogo, y ahí la instrucción que corresponde es la otra — que sí es sticky.

            Solo en la tabla de una visita (`conChip`): en la propuesta previa no hay nada
            que cargar. */}
        {conChip && (
            <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                Tu propuesta · tocá uno para cargar el resultado
            </p>
        )}
        {/* Sin `overflow-hidden`: recortaba las esquinas del header, pero un ancestro con
            overflow oculto anula el `position: sticky` de adentro contra el scroll del
            sheet. Las esquinas de arriba las redondea el propio header. */}
        <div className="w-full rounded-xl border border-dsline">
            {/* Sticky: con el catálogo abierto la lista pasa de 25 filas y, sin el rótulo
                a la vista, las tres columnas de números quedan sin identificar apenas se
                scrollea (ACTUAL vs. M.ANT vs. P.6M no se adivinan por el valor). */}
            <div className="sticky top-0 z-20 flex h-8 items-center gap-1 rounded-t-[11px] border-b border-dsline bg-[#F7F8FB] px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                {conChip && <div className={ANCHO_CHIP} />}
                {/* Solo "Rubro". La instrucción de tocar la fila vivió acá un rato y fue un
                    error: esta columna es la que absorbe lo que sobra después de los 26px
                    del chip y los 3×54px de números, así que en mobile mide ~60-100px y
                    "Rubro · tocá para cargar" salía cortado en "Rubro · tocá para c…" —
                    una instrucción truncada es peor que ninguna. Ahora vive en la banda de
                    ancho completo de arriba (`BANDA_PROPUESTA`), que es donde entra. */}
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
                <div
                    role="columnheader"
                    className={`${ANCHO_NUMERICA} ${OCULTA_ANGOSTO_HEADER} pr-1.5 text-right`}
                >
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
        </>
    )
}
