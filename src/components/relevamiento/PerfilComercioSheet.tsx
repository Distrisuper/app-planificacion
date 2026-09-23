import { useEffect, useState } from 'react'
import { Check, Loader2, Minus, Plus, WifiOff } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useCamposFicha } from '@/hooks/useCamposFicha'
import {
    AYUDA_POR_CAMPO,
    CAMPO_ESPECIALIDAD,
    CAMPO_MARCA,
    ESPECIALIDAD_CON_DETALLE,
    aValoresFicha,
    borradorDesdeValores,
    camposADibujar,
    faltantesFicha,
    opcionAbierta,
    pideMarca,
    type BorradorFicha,
} from '@/lib/relevamientos'
import type { IFichaCampoDef } from '@/types/planificacion'

const LABEL = 'mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'
const INPUT =
    'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy'

interface PerfilComercioSheetProps {
    open: boolean
    nombreCliente: string
    identidad?: string
    /** Qué campos dibujar: en el gate, `cliente.ficha.pendientes`. `undefined` = todos los del
     *  catálogo (modo edición). */
    campos?: readonly string[]
    /** 'gate' = botón "Iniciar visita" y texto de apoyo; 'edicion' = botón "Guardar", precarga. */
    modo: 'gate' | 'edicion'
    /** Rótulo sobre el nombre. Default "Datos del comercio"; la visita de alta usa "Ficha del
     *  comercio", el nombre de su renglón en la tarjeta. */
    eyebrow?: string
    valoresIniciales?: Record<string, string[]>
    /** true mientras corre el PUT (y, en el gate, el POST que le sigue). */
    guardando?: boolean
    /** Mensaje del último PUT fallido. El botón queda habilitado para reintentar. */
    error?: string | null
    onConfirmar: (valores: Record<string, string[]>) => void
    onClose: () => void
}

/**
 * "Datos del comercio": el relevamiento que se le pide al vendedor ANTES de abrir la
 * visita (modo 'gate'), y que puede corregir después desde `VisitaSheet` (modo 'edicion').
 *
 * **El formulario lo dibuja el catálogo**, no este archivo: `useCamposFicha` trae qué campos
 * hay, de qué tipo y con qué opciones, y acá sólo se elige el control según `tipo`+`multiple`.
 * Agregar una opción (o un campo entero de los cuatro tipos que ya existen) es un `UPDATE` en
 * `pl_ficha_campo`, no un deploy. Spec 2026-09-22-catalogo-de-ficha-dirigido-por-la-base.
 *
 * El `PUT /planificacion/clientes/:codigo/ficha` lo hace el padre (VisitaFlow), no este
 * componente: acá sólo se arma `{ campo: string[] }` y se avisa.
 *
 * Vocabulario de vendedor: "Datos del comercio", nunca "relevamiento" ni "perfilado".
 */
export default function PerfilComercioSheet({
    open,
    nombreCliente,
    identidad,
    campos,
    modo,
    eyebrow = 'Datos del comercio',
    valoresIniciales,
    guardando = false,
    error,
    onConfirmar,
    onClose,
}: PerfilComercioSheetProps) {
    // Sólo con el sheet abierto: el catálogo no hace falta para la agenda, y la mayoría de las
    // sesiones no abre este formulario ni una vez.
    const { data: catalogo, isError: fallóCatalogo, refetch: reintentarCatalogo } = useCamposFicha(open)
    const [borrador, setBorrador] = useState<BorradorFicha>(() => ({ valores: {}, abiertas: {} }))

    // Cada apertura arranca desde lo que hay: vacío en el gate (el cliente no tiene esos
    // campos), precargado en la edición. Depende del catálogo porque precargar "Otros" exige
    // saber qué códigos existen.
    useEffect(() => {
        if (open && catalogo) setBorrador(borradorDesdeValores(catalogo, valoresIniciales))
    }, [open, valoresIniciales, catalogo])

    const aDibujar = catalogo ? camposADibujar(catalogo, campos) : []
    const defMarca = catalogo?.find(c => c.campo === CAMPO_MARCA)
    const faltan = faltantesFicha(aDibujar, borrador, defMarca)
    // `catalogo` en la condición y no sólo `faltan.length`: con el GET en vuelo no hay campos
    // que dibujar, así que `faltan` es `[]` y el botón se auto-habilitaría — la misma trampa
    // que el gate de cierre de VisitaSheet tuvo que arreglar con `ofrecimientosCargados`.
    const completo = !!catalogo && faltan.length === 0

    function setValores(campo: string, vs: string[]) {
        setBorrador(b => ({ ...b, valores: { ...b.valores, [campo]: vs } }))
    }

    function toggleOpcion(def: IFichaCampoDef, codigo: string) {
        const actuales = borrador.valores[def.campo] ?? []
        const abierta = opcionAbierta(def)
        if (!def.multiple) {
            // Elegir un código cierra el modo "Otros"; elegir "Otros" lo abre y vacía el
            // valor para que el input arranque limpio.
            const esAbierta = abierta?.codigo === codigo
            setBorrador(b => ({
                ...b,
                valores: { ...b.valores, [def.campo]: esAbierta ? [] : [codigo] },
                abiertas: { ...b.abiertas, [def.campo]: esAbierta },
            }))
            return
        }
        const elegido = actuales.includes(codigo)
        const siguiente = elegido ? actuales.filter(c => c !== codigo) : [...actuales, codigo]
        // Destildar Monomarca se lleva la marca —y también el modo "Otros"—: dejarla
        // escondida y volver a tildarla más tarde la reabría con la de antes ya cargada.
        const limpiaMarca =
            def.campo === CAMPO_ESPECIALIDAD && elegido && codigo === ESPECIALIDAD_CON_DETALLE
        setBorrador(b => ({
            valores: {
                ...b.valores,
                [def.campo]: siguiente,
                ...(limpiaMarca ? { [CAMPO_MARCA]: [] } : {}),
            },
            abiertas: limpiaMarca ? { ...b.abiertas, [CAMPO_MARCA]: false } : b.abiertas,
        }))
    }

    /** Stepper. Desde vacío, "+" arranca en 1 (nadie tiene 0 personas trabajando). */
    function ajustarEntero(def: IFichaCampoDef, delta: number) {
        const min = def.minimo ?? 1
        const max = def.maximo ?? 999
        const actual = Number(borrador.valores[def.campo]?.[0] || 0)
        setValores(def.campo, [String(Math.min(max, Math.max(min, actual + delta)))])
    }

    function confirmar() {
        const valores = aValoresFicha(aDibujar, borrador, defMarca)
        if (!valores) return
        onConfirmar(valores)
    }

    const labelBoton = completo
        ? modo === 'gate' ? 'Iniciar visita' : 'Guardar'
        : faltan.length === 1 ? `Falta: ${faltan[0]}` : `Faltan ${faltan.length} datos`

    /** Un campo del catálogo, con el control que le corresponde por `tipo` + `multiple`. */
    function dibujarCampo(def: IFichaCampoDef) {
        const ayuda = AYUDA_POR_CAMPO[def.campo]
        const titulo = (
            <span className={LABEL}>
                {def.descripcion}
                {def.tipo === 'opcion' && def.multiple && ' · una o varias'}
                {ayuda && (
                    // Aclaración pegada al título, no al control: es contexto de la pregunta
                    // ("¿cuento al dueño?"), no una instrucción. Normal-case y sin negrita
                    // para que no compita con el título en mayúsculas.
                    <span className="ml-1 font-normal normal-case tracking-normal text-dsmuted/70">
                        · {ayuda}
                    </span>
                )}
            </span>
        )

        if (def.tipo === 'opcion' && def.multiple) {
            return (
                <section key={def.campo}>
                    {titulo}
                    <div className="flex flex-wrap gap-1.5">
                        {(def.opciones ?? []).map(o => (
                            <Chip
                                key={o.codigo}
                                label={o.label}
                                elegida={(borrador.valores[def.campo] ?? []).includes(o.codigo)}
                                onClick={() => toggleOpcion(def, o.codigo)}
                            />
                        ))}
                    </div>
                    {def.campo === CAMPO_ESPECIALIDAD && pideMarca(borrador) && defMarca && (
                        <div className="mt-2.5">{dibujarCampo(defMarca)}</div>
                    )}
                </section>
            )
        }

        if (def.tipo === 'opcion') {
            const abierta = opcionAbierta(def)
            const enOtros = !!borrador.abiertas[def.campo]
            const elegidoCodigo = enOtros ? abierta?.codigo : borrador.valores[def.campo]?.[0]
            // Segmented sólo cuando todas las opciones traen `labelCorto` — es la señal de
            // que fueron pensadas para entrar juntas en el ancho de un teléfono (los 5
            // tramos de facturación). Sin eso, chips: seis marcas en una fila no entran.
            const usaSegmented = (def.opciones ?? []).every(o => o.labelCorto)
            return (
                <section key={def.campo}>
                    {titulo}
                    {usaSegmented ? (
                        <div
                            role="radiogroup"
                            aria-label={def.descripcion}
                            className="flex overflow-hidden rounded-[11px] border-[1.5px] border-[#E4E8F0]"
                        >
                            {(def.opciones ?? []).map((o, i) => (
                                <button
                                    key={o.codigo}
                                    type="button"
                                    role="radio"
                                    aria-checked={elegidoCodigo === o.codigo}
                                    aria-label={o.label}
                                    onClick={() => toggleOpcion(def, o.codigo)}
                                    className={`h-11 flex-1 text-[12.5px] font-bold transition-colors ${
                                        i > 0 ? 'border-l-[1.5px] border-[#E4E8F0]' : ''
                                    } ${elegidoCodigo === o.codigo ? 'bg-dsnavy text-white' : 'text-[#182645]'}`}
                                >
                                    {o.labelCorto}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {(def.opciones ?? []).map(o => (
                                <Chip
                                    key={o.codigo}
                                    label={o.label}
                                    elegida={elegidoCodigo === o.codigo}
                                    onClick={() => toggleOpcion(def, o.codigo)}
                                />
                            ))}
                        </div>
                    )}
                    {enOtros && (
                        <input
                            aria-label={`${def.descripcion} — otra`}
                            className={`${INPUT} mt-2`}
                            maxLength={def.maximo ?? 100}
                            autoFocus
                            placeholder="Escribila"
                            value={borrador.valores[def.campo]?.[0] ?? ''}
                            onChange={e => setValores(def.campo, [e.target.value])}
                        />
                    )}
                </section>
            )
        }

        if (def.tipo === 'entero') {
            const valor = borrador.valores[def.campo]?.[0] ?? ''
            const min = def.minimo ?? 1
            const max = def.maximo ?? 999
            return (
                <section key={def.campo}>
                    <label htmlFor={`pc-${def.campo}`} className={LABEL}>
                        {def.descripcion}
                        {ayuda && (
                            <span className="ml-1 font-normal normal-case tracking-normal text-dsmuted/70">
                                · {ayuda}
                            </span>
                        )}
                    </label>
                    {/* Stepper y no un input pelado: era el único control del formulario
                        que abría teclado, y en un bottom sheet el teclado empuja el layout
                        y tapa el botón del pie. El caso típico (1-10 personas) se resuelve
                        tocando "+"; el que tiene 40 toca el número y lo tipea. */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={`Restar en ${def.descripcion}`}
                            onClick={() => ajustarEntero(def, -1)}
                            disabled={valor === '' || Number(valor) <= min}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#E4E8F0] text-dsnavy disabled:opacity-40"
                        >
                            <Minus className="h-4 w-4" strokeWidth={3} />
                        </button>
                        <input
                            id={`pc-${def.campo}`}
                            // `!w-[72px]` con important: mezclado con `w-full` de INPUT en la
                            // misma clase, el orden de las utilities en el CSS compilado no
                            // sigue el orden del string y a veces ganaba `w-full` — el input
                            // se estiraba a todo el ancho y generaba scroll horizontal.
                            className={`${INPUT} !w-[72px] shrink-0 text-center`}
                            // `inputMode` y no `type="number"`: las flechitas no sirven en
                            // mobile, y en desktop un scroll accidental sobre el campo
                            // enfocado le cambia el valor sin que nadie lo note.
                            inputMode="numeric"
                            maxLength={String(max).length}
                            placeholder="0"
                            value={valor}
                            onChange={e =>
                                setValores(def.campo, [
                                    e.target.value.replace(/\D/g, '').slice(0, String(max).length),
                                ])
                            }
                        />
                        <button
                            type="button"
                            aria-label={`Sumar en ${def.descripcion}`}
                            onClick={() => ajustarEntero(def, 1)}
                            disabled={Number(valor) >= max}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#E4E8F0] text-dsnavy disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" strokeWidth={3} />
                        </button>
                    </div>
                </section>
            )
        }

        return (
            <section key={def.campo}>
                <label htmlFor={`pc-${def.campo}`} className={LABEL}>
                    {def.descripcion}
                </label>
                <input
                    id={`pc-${def.campo}`}
                    className={INPUT}
                    maxLength={def.maximo ?? 100}
                    value={borrador.valores[def.campo]?.[0] ?? ''}
                    onChange={e => setValores(def.campo, [e.target.value])}
                />
            </section>
        )
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            eyebrow={eyebrow}
            title={nombreCliente}
            subtitle={identidad}
            altura="hasta-completa"
            footer={
                // Sin catálogo no hay botón: ofrecerlo habilitado sobre un formulario que
                // todavía no se dibujó mandaría un PUT vacío.
                catalogo ? (
                    <Button
                        onClick={confirmar}
                        disabled={!completo || guardando}
                        loading={guardando}
                        // Gris mientras falte algo — mismo criterio que el cierre de visita:
                        // el verde al 40% del `disabled:` del variant se lee como un CTA roto
                        // en vez de como "te falta cargar algo". `disabled:opacity-100` es
                        // imprescindible: sin él, el 40% también lava el gris y deja ilegible
                        // justo el texto que hay que leer (qué falta).
                        className={
                            completo
                                ? 'h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90'
                                : 'h-12 w-full bg-[#F1F4F9] text-[14.5px] text-dsnavy hover:bg-[#F1F4F9] disabled:opacity-100'
                        }
                    >
                        {labelBoton}
                    </Button>
                ) : undefined
            }
        >
            <div className="flex flex-col gap-5">
                {!catalogo ? (
                    fallóCatalogo ? (
                        // Mismo patrón que `fallóPropuestaDirecta` en VisitaFlow: un error de
                        // red no puede dejar la pantalla en un spinner del que no se sale.
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <WifiOff className="h-7 w-7 text-dsmuted" strokeWidth={2} />
                            <p className="text-[13px] font-semibold text-[#182645]">
                                No pudimos traer los datos que hay que cargar.
                            </p>
                            <Button
                                onClick={() => reintentarCatalogo()}
                                className="h-11 w-full max-w-[240px] bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                            >
                                Volver a intentar
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-dsnavy" strokeWidth={2.4} />
                        </div>
                    )
                ) : (
                    <>
                        {modo === 'gate' && (
                            // Una línea, no dos: el bloque de arriba del sheet es el que menos
                            // rinde por píxel, y lo único que hay que justificar es por qué se
                            // interrumpe el inicio de la visita.
                            <p className="-mt-1 text-[12.5px] leading-snug text-dsmuted">
                                Se carga una sola vez, antes de arrancar.
                            </p>
                        )}
                        {aDibujar.map(dibujarCampo)}
                    </>
                )}

                {error && (
                    <p role="alert" className="rounded-[11px] bg-dsred/8 px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-dsred">
                        {error}
                    </p>
                )}
            </div>
        </BottomSheet>
    )
}

function Chip({
    label,
    elegida,
    onClick,
}: {
    label: string
    elegida: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            aria-pressed={elegida}
            onClick={onClick}
            className={`flex items-center gap-1 rounded-full px-3 py-2 text-[12.5px] font-semibold leading-none transition-colors ${
                elegida ? 'bg-dsnavy text-white' : 'border-[1.5px] border-[#E1E6F0] text-[#182645]'
            }`}
        >
            {elegida && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {label}
        </button>
    )
}
