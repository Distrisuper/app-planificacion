import { useEffect, useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import {
    ESPECIALIDAD_CON_DETALLE,
    ESPECIALIDADES,
    PERSONAS_MAX,
    TRAMOS_FACTURACION,
    aValoresFicha,
    deValoresFicha,
    faltantesPerfil,
    type BorradorPerfil,
} from '@/lib/relevamientos'

const LABEL = 'mb-2 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'
const INPUT =
    'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy'

interface PerfilComercioSheetProps {
    open: boolean
    nombreCliente: string
    identidad?: string
    /** Qué campos dibujar: en el gate, `cliente.ficha.pendientes`; en edición, CAMPOS_FICHA. */
    campos: readonly string[]
    /** 'gate' = botón "Iniciar visita" y texto de apoyo; 'edicion' = botón "Guardar", precarga. */
    modo: 'gate' | 'edicion'
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
 * `campos` viene de `cliente.ficha.pendientes` en el gate, o de `CAMPOS_FICHA` completo en
 * la edición. El `PUT /planificacion/clientes/:codigo/ficha` lo hace el padre (VisitaFlow),
 * no este componente: acá sólo se arma `{ campo: string[] }` y se avisa.
 *
 * Vocabulario de vendedor: "Datos del comercio", nunca "relevamiento" ni "perfilado".
 */
export default function PerfilComercioSheet({
    open,
    nombreCliente,
    identidad,
    campos,
    modo,
    valoresIniciales,
    guardando = false,
    error,
    onConfirmar,
    onClose,
}: PerfilComercioSheetProps) {
    const [borrador, setBorrador] = useState<BorradorPerfil>(() => deValoresFicha(valoresIniciales))

    // Cada apertura arranca desde lo que hay: vacío en el gate (el cliente no tiene esos
    // campos), precargado en la edición.
    useEffect(() => {
        if (open) setBorrador(deValoresFicha(valoresIniciales))
    }, [open, valoresIniciales])

    const faltan = faltantesPerfil(borrador, campos)
    const completo = faltan.length === 0
    const pideMarca = borrador.especialidades.includes(ESPECIALIDAD_CON_DETALLE)
    const muestra = (c: string) => campos.includes(c)

    function toggleEspecialidad(codigo: string) {
        setBorrador(b => ({
            ...b,
            especialidades: b.especialidades.includes(codigo)
                ? b.especialidades.filter(c => c !== codigo)
                : [...b.especialidades, codigo],
            // Destildar Monomarca se lleva el texto: dejarlo escondido y volver a
            // tildarla más tarde la reabría con la marca de antes ya cargada.
            monomarcaDetalle:
                codigo === ESPECIALIDAD_CON_DETALLE &&
                b.especialidades.includes(ESPECIALIDAD_CON_DETALLE)
                    ? ''
                    : b.monomarcaDetalle,
        }))
    }

    /** Stepper. Desde vacío, "+" arranca en 1 (nadie tiene 0 personas trabajando). */
    function ajustarPersonas(delta: number) {
        setBorrador(b => {
            const actual = Number(b.personas || 0)
            const proximo = Math.min(PERSONAS_MAX, Math.max(1, actual + delta))
            return { ...b, personas: String(proximo) }
        })
    }

    function confirmar() {
        const valores = aValoresFicha(borrador, campos)
        if (!valores) return
        onConfirmar(valores)
    }

    const labelBoton = completo
        ? modo === 'gate' ? 'Iniciar visita' : 'Guardar'
        : faltan.length === 1 ? `Falta ${faltan[0]}` : `Faltan ${faltan.length} datos`

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            eyebrow="Datos del comercio"
            title={nombreCliente}
            subtitle={identidad}
            altura="hasta-completa"
            footer={
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
            }
        >
            <div className="flex flex-col gap-5">
                {modo === 'gate' && (
                    // Una línea, no dos: el bloque de arriba del sheet es el que menos
                    // rinde por píxel, y lo único que hay que justificar es por qué se
                    // interrumpe el inicio de la visita.
                    <p className="-mt-1 text-[12.5px] leading-snug text-dsmuted">
                        Se carga una sola vez, antes de arrancar.
                    </p>
                )}

                {muestra('especialidad') && (
                <section>
                    <span className={LABEL}>Especialidad · una o varias</span>
                    <div className="flex flex-wrap gap-1.5">
                        {ESPECIALIDADES.map(e => {
                            const elegida = borrador.especialidades.includes(e.codigo)
                            return (
                                <button
                                    key={e.codigo}
                                    type="button"
                                    aria-pressed={elegida}
                                    onClick={() => toggleEspecialidad(e.codigo)}
                                    className={`flex items-center gap-1 rounded-full px-3 py-2 text-[12.5px] font-semibold leading-none transition-colors ${
                                        elegida
                                            ? 'bg-dsnavy text-white'
                                            : 'border-[1.5px] border-[#E1E6F0] text-[#182645]'
                                    }`}
                                >
                                    {elegida && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                                    {e.label}
                                </button>
                            )
                        })}
                    </div>
                    {pideMarca && (
                        <div className="mt-2.5">
                            <label htmlFor="pc-marca" className={LABEL}>
                                ¿De qué marca?
                            </label>
                            <input
                                id="pc-marca"
                                className={INPUT}
                                maxLength={60}
                                autoFocus
                                placeholder="Ej. Ford"
                                value={borrador.monomarcaDetalle}
                                onChange={e =>
                                    setBorrador(b => ({ ...b, monomarcaDetalle: e.target.value }))
                                }
                            />
                        </div>
                    )}
                </section>
                )}

                {muestra('personas') && (
                <section>
                    <label htmlFor="pc-personas" className={LABEL}>
                        Personas que trabajan
                        {/* Aclaración pegada al título, no al stepper: es contexto de la
                            pregunta ("¿cuento al dueño?"), no una instrucción del control.
                            Normal-case y sin negrita para que no compita con el título en
                            mayúsculas — es una aclaración, no otro título. */}
                        <span className="ml-1 font-normal normal-case tracking-normal text-dsmuted/70">
                            · incluido el dueño
                        </span>
                    </label>
                    {/* Stepper y no un input pelado: era el único control del formulario
                        que abría teclado, y en un bottom sheet el teclado empuja el
                        layout y tapa el botón del pie. El caso típico (1-10 personas) se
                        resuelve tocando "+"; el que tiene 40 toca el número y lo tipea. */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="Restar una persona"
                            onClick={() => ajustarPersonas(-1)}
                            disabled={borrador.personas === '' || Number(borrador.personas) <= 1}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#E4E8F0] text-dsnavy disabled:opacity-40"
                        >
                            <Minus className="h-4 w-4" strokeWidth={3} />
                        </button>
                        <input
                            id="pc-personas"
                            // `!w-[72px]` con important: mezclado con `w-full` de INPUT en la
                            // misma clase, el orden de las utilities en el CSS compilado no
                            // sigue el orden del string y a veces ganaba `w-full` — el input
                            // se estiraba a todo el ancho del sheet y generaba scroll
                            // horizontal en toda la fila (incluido "Incluido el dueño").
                            className={`${INPUT} !w-[72px] shrink-0 text-center`}
                            // `inputMode` y no `type="number"`: las flechitas no sirven en
                            // mobile, y en desktop un scroll accidental sobre el campo
                            // enfocado le cambia el valor sin que nadie lo note.
                            inputMode="numeric"
                            maxLength={3}
                            placeholder="0"
                            value={borrador.personas}
                            onChange={e =>
                                setBorrador(b => ({
                                    ...b,
                                    personas: e.target.value.replace(/\D/g, '').slice(0, 3),
                                }))
                            }
                        />
                        <button
                            type="button"
                            aria-label="Sumar una persona"
                            onClick={() => ajustarPersonas(1)}
                            disabled={Number(borrador.personas) >= PERSONAS_MAX}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-[#E4E8F0] text-dsnavy disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" strokeWidth={3} />
                        </button>
                    </div>
                </section>
                )}

                {muestra('facturacion') && (
                <section>
                    <span className={LABEL}>Facturación mensual</span>
                    {/* Segmented control, no cinco filas con radio: son etiquetas de tres
                        palabras sobre una escala ordinal. En filas costaban ~240px (un
                        tercio del sheet) y la quinta opción quedaba abajo del scroll, así
                        que nadie sabía que existía. Unidos en una sola pieza además dicen
                        "elegí uno" — los chips sueltos de especialidad dicen "elegí las
                        que quieras", y antes los dos grupos se veían igual. */}
                    <div
                        role="radiogroup"
                        aria-label="Facturación mensual"
                        className="flex overflow-hidden rounded-[11px] border-[1.5px] border-[#E4E8F0]"
                    >
                        {TRAMOS_FACTURACION.map((t, i) => {
                            const elegido = borrador.facturacion === t.codigo
                            return (
                                <button
                                    key={t.codigo}
                                    type="button"
                                    role="radio"
                                    aria-checked={elegido}
                                    aria-label={t.label}
                                    onClick={() =>
                                        setBorrador(b => ({ ...b, facturacion: t.codigo }))
                                    }
                                    className={`h-11 flex-1 text-[12.5px] font-bold transition-colors ${
                                        i > 0 ? 'border-l-[1.5px] border-[#E4E8F0]' : ''
                                    } ${elegido ? 'bg-dsnavy text-white' : 'text-[#182645]'}`}
                                >
                                    {t.labelCorto}
                                </button>
                            )
                        })}
                    </div>
                </section>
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
