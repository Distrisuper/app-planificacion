import { useState } from 'react'
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { fmtAmount } from '@/lib/fmtAmount'
import { resumenAlcance } from '@/lib/alcance'
import { registroDetalleAccion } from './accionDetalle/registro'
import { separarSegmentos } from './filas'
import type { IMarcaEstado, TipoOfrecimiento } from '@/types/planificacion'
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

/** 'pesos' (default) o 'unidades' — interruptor de todo lo que muestra `OfrecimientoTable`.
 *  El endpoint ya manda ambos períodos (spec 2026-09-16 §3.2); esto es el "front-only". */
export type ModoValor = 'pesos' | 'unidades'

const FMT_UNIDADES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Igual criterio que `fmtAmount` para el cero (0 unidades no es dato, es "no compró"),
 *  pero sin el "$" ni la escala a miles: una unidad es una unidad. */
function fmtUnidades(valor: number): string {
    const rounded = Math.round(valor)
    return rounded === 0 ? '–' : FMT_UNIDADES.format(rounded)
}

function fmtCelda(valor: number | null, modo: ModoValor) {
    if (valor == null) return '–'
    return modo === 'unidades' ? fmtUnidades(valor) : fmtAmount(valor)
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
const ANCHO_NUMERICA = 'w-[48px] shrink-0'
// M.ANT es la unica de las tres columnas numericas que se esconde abajo de 360px: es la
// menos cargada de las tres (la propuesta se arma comparando ACTUAL contra P.6M, no
// contra el mes anterior), y esos 48px son la diferencia entre leer "PARRILLAS, BRAZ..."
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
    abierta,
    compacta,
    modo = 'pesos',
}: {
    valor: number | null
    promedio6m: number | null
    referencia?: boolean
    /** true = la columna desaparece abajo de 360px. Tiene que ir junto con el mismo flag
     *  en su header (ver OCULTA_ANGOSTO_CELDA). */
    ocultaEnAngosto?: boolean
    /** true mientras la zona de marcas de esta fila está desplegada: la pastilla pasa a
     *  blanco para no competir con el tinte navy claro del botón que la contiene. */
    abierta?: boolean
    /** true en las sub-filas de marca: pastilla más chica que la del rubro. */
    compacta?: boolean
    modo?: ModoValor
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
                className={`inline-block rounded-md lining-nums tabular-nums slashed-zero whitespace-nowrap font-semibold ${
                    compacta ? 'px-1 py-0 text-[10.5px]' : 'px-1 py-0.5 text-[12px] tracking-[-0.01em]'
                } ${
                    referencia
                        ? 'bg-[#F1F3F8] text-dsmuted'
                        : rojo
                          ? 'bg-[#FEECEC] text-dsred'
                          : abierta
                            ? 'bg-white text-[#182645]'
                            : 'bg-[#F1F3F8] text-[#182645]'
                }`}
            >
                {fmtCelda(valor, modo)}
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

/** Nombre + chip de tipo y alcance/detalle si aplica. El chip de tipo no se pinta para
 *  'rubro': es el caso por defecto y repetirlo en cada fila es ruido. "SKF" sin decir
 *  que es una marca sí es ambiguo, y esa es la razón del chip. */
function NombreFila({ fila }: { fila: IOfrecimientoFila }) {
    const moduloDetalle = registroDetalleAccion[fila.codigo]
    return (
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
    )
}

/** Las tres columnas numéricas, siempre en ese orden y con el mismo ancho que el
 *  header. `rubroStatus` (de donde salen estos números) está indexado por código de
 *  RUBRO — una acción o una marca nunca matchean ahí, así que mostrar las tres celdas
 *  en guiones se lee como "falta cargar" cuando en realidad ese dato no existe para
 *  estos tipos de ofrecimiento. */
function CeldasFila({
    fila,
    abierta,
    modo = 'pesos',
}: {
    fila: IOfrecimientoFila
    abierta?: boolean
    modo?: ModoValor
}) {
    if (fila.tipo !== 'rubro') return null
    const actual = modo === 'unidades' ? (fila.actualUnidades ?? null) : fila.actual
    const mesAnterior = modo === 'unidades' ? (fila.mesAnteriorUnidades ?? null) : fila.mesAnterior
    const promedio6m = modo === 'unidades' ? (fila.promedio6mUnidades ?? null) : fila.promedio6m
    return (
        <>
            <Celda valor={actual} promedio6m={promedio6m} abierta={abierta} modo={modo} />
            <Celda valor={mesAnterior} promedio6m={promedio6m} ocultaEnAngosto abierta={abierta} modo={modo} />
            <Celda valor={promedio6m} promedio6m={promedio6m} referencia abierta={abierta} modo={modo} />
        </>
    )
}

/** Nombre + las tres columnas numéricas. Usado por las variantes que NO parten la
 *  fila en dos zonas (read-only, agregable, o resoluble sin marcas para desplegar). */
function ContenidoFila({ fila, modo }: { fila: IOfrecimientoFila; modo?: ModoValor }) {
    return (
        <>
            <NombreFila fila={fila} />
            <CeldasFila fila={fila} modo={modo} />
        </>
    )
}

/** Las marcas del cliente en este rubro, desplegadas debajo de la fila. Todas, sin
 *  recorte: son las que explican el total de ACTUAL/M.ANT/P.6M del rubro — mostrar
 *  solo 3 y colapsar el resto dejaba el total sin justificar a simple vista. */
function SubFilasMarcas({
    marcas,
    conChip,
    conColumnaQuitar,
    modo = 'pesos',
}: {
    marcas: IMarcaEstado[]
    conChip: boolean
    conColumnaQuitar: boolean
    modo?: ModoValor
}) {
    return (
        <div className="bg-[#F7F8FB]">
            {marcas.map((m, i) => {
                const actual = modo === 'unidades' ? (m.actualUnidades ?? null) : m.actual
                const mesAnterior = modo === 'unidades' ? (m.mesAnteriorUnidades ?? null) : m.mesAnterior
                const promedio6m = modo === 'unidades' ? (m.promedio6mUnidades ?? null) : m.promedio6m
                return (
                    <div
                        key={m.code}
                        role="row"
                        data-marca={m.code}
                        className="flex min-h-[30px] items-center gap-1 pl-2.5 pr-1.5 text-[11.5px] font-semibold text-[#3B4761]"
                    >
                        {conChip && (
                            <div className={`${ANCHO_CHIP} flex justify-center`}>
                                <span aria-hidden className={`h-[13px] w-[3px] rounded-sm ${i === 0 ? 'bg-dsnavy' : 'bg-[#C9D2E3]'}`} />
                            </div>
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 truncate">{m.nombre}</span>
                        </div>
                        <Celda valor={actual} promedio6m={promedio6m} compacta modo={modo} />
                        <Celda valor={mesAnterior} promedio6m={promedio6m} ocultaEnAngosto compacta modo={modo} />
                        <Celda valor={promedio6m} promedio6m={promedio6m} referencia compacta modo={modo} />
                        {conColumnaQuitar && <div className={ANCHO_QUITAR} />}
                    </div>
                )
            })}
        </div>
    )
}

/** Una fila completa, siempre de UNA sola línea (más las sub-filas de marca cuando está
 *  desplegada). Las variantes (read-only, resoluble, agregable) comparten la misma
 *  altura y las mismas columnas — lo único que cambia es qué pasa al tocarla y qué
 *  muestra el chip del principio.
 *
 *  Una fila resoluble con marcas se parte en DOS zonas: el nombre carga el resultado
 *  (es donde vive el estado), los números despliegan las marcas del cliente en ese
 *  rubro. Una fila agregable no se parte (toda la fila agrega); una fila de la
 *  propuesta previa (ni resoluble ni agregable) despliega con toda la fila, porque ahí
 *  no hay otra acción que compita por el toque. */
function FilaOfrecimiento({
    fila,
    conBorde,
    conChip,
    conColumnaQuitar,
    abierta = false,
    modo = 'pesos',
    onToggleMarcas,
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
    abierta?: boolean
    modo?: ModoValor
    onToggleMarcas?: (codigo: string) => void
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

    const tieneMarcas = fila.tipo === 'rubro' && fila.marcas.length > 0
    const dosZonas = !!resolucion && tieneMarcas
    const filaEnteraDespliega = !resolucion && !fila.agregable && tieneMarcas

    const chip =
        conChip &&
        (resolucion ? (
            <ChipEstado resolucion={resolucion} />
        ) : fila.agregable ? (
            <ChipAgregar />
        ) : (
            <div className={ANCHO_CHIP} />
        ))

    const interior = (
        <>
            {chip}
            <ContenidoFila fila={fila} modo={modo} />
        </>
    )

    return (
        <div className={conBorde ? 'border-b border-dsline' : ''}>
            <div className="flex items-stretch">
                {dosZonas ? (
                    <>
                        <button
                            type="button"
                            aria-label={`Resolución de ${fila.nombre}`}
                            disabled={agregando}
                            onClick={() => onResolucion?.(resolucion.ofrecimientoId)}
                            // max-w-[50%]: sin este tope el nombre se comía todo el espacio
                            // sobrante y la zona de números (abajo) quedaba angosta y con un
                            // hueco en blanco entre las dos — el tope libera ese espacio para
                            // que lo ocupe la zona de números, que crece con flex-1 abajo.
                            className="flex min-w-0 max-w-[50%] items-center gap-1 py-2 pl-2.5 text-left active:bg-[#F7F8FB]"
                        >
                            {chip}
                            <NombreFila fila={fila} />
                        </button>
                        <button
                            type="button"
                            aria-label={`Marcas de ${fila.nombre}`}
                            aria-expanded={abierta}
                            onClick={() => onToggleMarcas?.(fila.codigo)}
                            className={`flex flex-1 items-center justify-end gap-1 py-2 pr-1.5 ${
                                // Tinte parejo aun sin tocar: marca la zona de números como
                                // su propio control, distinto del nombre (sin fondo). Solo
                                // cuando hay dos zonas — la fila de una sola zona no lo lleva.
                                // flex-1 (en vez de shrink-0) para que el tinte llegue hasta
                                // el borde del botón de al lado, sin dejar blanco de por medio.
                                abierta ? 'bg-[#EEF3FB]' : 'bg-[#FAFBFD] active:bg-[#F1F3F8]'
                            }`}
                        >
                            <CeldasFila fila={fila} abierta={abierta} modo={modo} />
                        </button>
                    </>
                ) : filaEnteraDespliega ? (
                    <button
                        type="button"
                        aria-label={`Marcas de ${fila.nombre}`}
                        aria-expanded={abierta}
                        onClick={() => onToggleMarcas?.(fila.codigo)}
                        className={`${clasesFila} ${abierta ? 'bg-[#EEF3FB]' : 'active:bg-[#F7F8FB]'}`}
                    >
                        {chip}
                        <NombreFila fila={fila} />
                        <CeldasFila fila={fila} abierta={abierta} modo={modo} />
                    </button>
                ) : resolucion || fila.agregable ? (
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
            {abierta && tieneMarcas && (
                <SubFilasMarcas marcas={fila.marcas} conChip={conChip} conColumnaQuitar={conColumnaQuitar} modo={modo} />
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

/** Interruptor $ / U de las tres columnas numéricas: un solo botón que alterna, en el
 *  slot de 26px del header de columnas — arriba de donde cae `ChipEstado` en cada fila,
 *  mismo eje. Un botón que cambia de letra (no dos pastillas lado a lado) porque ahí
 *  no entran dos etiquetas sin angostar la columna Rubro.
 *
 *  Pastilla tenue (mismo lenguaje que "No visité" en el header de la visita: borde y
 *  fondo al 20-ish% del color, texto sólido), no un círculo relleno. Un relleno sólido
 *  navy en el header, arriba de una columna de anillos y checks también navy/verde,
 *  competía con esos indicadores en vez de leerse como un control aparte — "llamaba
 *  demasiado la atención". El cuadrado redondeado (contra los círculos de las filas)
 *  ya alcanza para diferenciarlo por forma; no hace falta además ganarles en peso. */
function ModoValorBoton({ modo, onChange }: { modo: ModoValor; onChange: (modo: ModoValor) => void }) {
    return (
        <button
            type="button"
            aria-label="Mostrar en pesos o en unidades"
            aria-pressed={modo === 'unidades'}
            onClick={() => onChange(modo === 'pesos' ? 'unidades' : 'pesos')}
            className="grid h-5 w-5 place-items-center rounded-md border border-dsnavy/25 bg-dsnavy/8 text-[10px] font-extrabold normal-case text-dsnavy active:bg-dsnavy/15"
        >
            {modo === 'pesos' ? '$' : 'U'}
        </button>
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
    // Una sola fila desplegada a la vez: abrir otra cierra la anterior.
    const [abiertaCodigo, setAbiertaCodigo] = useState<string | null>(null)
    const [modo, setModo] = useState<ModoValor>('unidades')
    function toggleMarcas(codigo: string) {
        setAbiertaCodigo(prev => (prev === codigo ? null : codigo))
    }

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
        {/* Margen negativo: el BottomSheet da px-[18px], y esto compensa para que la
            tabla quede al borde (12px del borde del sheet) en vez de encajonada. No toca
            el padding del sheet — lo usan otras pantallas. */}
        <div className="-mx-1.5">
        {/* El gesto se explica en el "?" del header del sheet (`BottomSheet.onHelp` +
            `ayudaContenido`), no acá: esta banda es solo el rótulo de sección. */}
        {conChip && (
            <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted leading-[1.35]">
                Tu propuesta
            </p>
        )}
        <div className="w-full">
            {/* Sticky: con el catálogo abierto la lista pasa de 25 filas y, sin el rótulo
                a la vista, las tres columnas de números quedan sin identificar apenas se
                scrollea (ACTUAL vs. M.ANT vs. P.6M no se adivinan por el valor). */}
            <div className="sticky top-0 z-20 flex h-8 items-center gap-1 border-y border-dsline bg-[#F7F8FB] px-2.5 text-[10px] font-extrabold uppercase tracking-wide text-dsmuted">
                {/* El interruptor $/U vive en el mismo slot de 26px que `ChipEstado`: es
                    la primera opción del header, justo arriba de los ✓/anillos de la
                    columna. Solo cuando hay chip (tabla de una visita) — en la propuesta
                    previa ese slot no se reserva y el interruptor no tiene dónde ir. */}
                {conChip && (
                    <div className={`${ANCHO_CHIP} flex justify-start`}>
                        <ModoValorBoton modo={modo} onChange={setModo} />
                    </div>
                )}
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
                        abierta={abiertaCodigo === fila.codigo}
                        modo={modo}
                        onToggleMarcas={toggleMarcas}
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
                        abierta={abiertaCodigo === fila.codigo}
                        modo={modo}
                        onToggleMarcas={toggleMarcas}
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
        </div>
        </>
    )
}
