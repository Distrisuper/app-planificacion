import { ChevronDown, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'
import { useAlturaTeclado } from '@/hooks/useAlturaTeclado'

interface BottomSheetProps {
    open: boolean
    onClose: () => void
    title: string
    eyebrow?: string
    eyebrowClassName?: string
    /** Línea chica BAJO el título (ej. `#10034 · DERQUI AUTOPARTES SRL`). Va acá y no en
     *  el `eyebrow` porque en VisitaSheet ese slot ya lo ocupa el semáforo + cronómetro
     *  de la visita en curso. */
    subtitle?: string
    /** Si se pasa, aparece un botón de minimizar al lado de la X. */
    onMinimize?: () => void
    /** Si se pasa, aparece un botón de ayuda (círculo "?"), primero de los tres — antes
     *  de minimizar y cerrar. La pantalla es la dueña del contenido (qué explica); acá
     *  solo vive el botón, con el mismo lenguaje visual que minimizar/cerrar. */
    onHelp?: () => void
    /** Para el `aria-expanded` del botón de ayuda: la pantalla es la que sabe si el
     *  panel de ayuda está abierto. */
    ayudaAbierta?: boolean
    /** Contenido del panel flotante que abre "?" (ver `onHelp`). Vive en `BottomSheet`,
     *  no en el contenido del sheet: un bloque en el flujo normal empujaba toda la
     *  lista de abajo cada vez que se abría — acá flota, anclado al botón. */
    ayudaContenido?: ReactNode
    /** Si se pasa, se pinta en el renglón del `subtitle`, empujado con `ml-auto` hasta el
     *  borde derecho del header (a la altura de minimizar/cerrar) — sin menú intermedio:
     *  un solo control secundario visible de entrada, sin gastar alto del pie. Pensado
     *  para acciones que necesitan encontrarse rápido (ej. "No visité" durante la
     *  visita) — un menú de un solo ítem agrega un toque de más sin ganar nada a cambio.
     *  El sheet no sabe qué es: sólo lo muestra. */
    acciones?: ReactNode
    /**
     * Cuánto alto toma el sheet. Los tres modos dejan siempre una franja arriba
     * para que se siga leyendo como modal; lo que cambia es qué manda, si el
     * contenido o la pantalla:
     *
     * - 'auto' (default): mide lo que mida el contenido, hasta 85vh.
     * - 'hasta-completa': ídem, pero llega hasta 90dvh antes de scrollear. Para
     *   contenido de alto variable que a veces entra justo y a veces no (ej. el
     *   sheet de estado: cinco zonas o una sola, según el vendedor). Con altura
     *   fija, el caso corto deja un hueco blanco de ~200px sobre el pie.
     * - 'completa': altura fija de 96dvh. Para listas largas de alto imprevisible
     *   (la propuesta), donde un sheet que crece y se achica según cuántos rubros
     *   trajo el cliente hace saltar el pie de botones entre un cliente y otro.
     */
    altura?: 'auto' | 'hasta-completa' | 'completa'
    /**
     * Contenido fijo al pie, fuera del área de scroll (ej. el botón "Iniciar
     * visita"). Sin esto el sheet se comporta como antes: todo el contenido,
     * incluido lo que iría acá, scrollea junto con `children`.
     */
    footer?: ReactNode
    children: ReactNode
}

export default function BottomSheet({
    open,
    onClose,
    title,
    eyebrow,
    eyebrowClassName,
    subtitle,
    onMinimize,
    onHelp,
    ayudaAbierta,
    ayudaContenido,
    acciones,
    altura = 'auto',
    footer,
    children,
}: BottomSheetProps) {
    // Hook antes del `if (!open)`: las reglas de hooks exigen llamarlo siempre, y
    // adentro se gatea con `open` para no dejar un listener de por vida en un sheet
    // cerrado. Ver el porqué completo en useAlturaTeclado.
    const alturaTeclado = useAlturaTeclado(open)
    if (!open) return null
    return (
        // `paddingBottom` empuja el sheet (alineado `items-end`) hacia arriba, tanto
        // como lo tapa el teclado — así el pie fijo (observaciones, Cerrar visita) no
        // queda debajo. En Android ya lo resuelve `interactive-widget=resizes-content`
        // solo (acá da 0); esto es lo que hace falta en iOS, que no lo soporta.
        <div
            className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/45"
            style={{ paddingBottom: alturaTeclado }}
            onClick={onClose}
        >
            <div
                className={`animate-sheet-up relative flex w-full flex-col rounded-t-[24px] bg-white shadow-[0_-10px_34px_rgba(10,15,30,.22)] ${
                    // En 'completa', el max-h no llega a aplicar nunca con dvh soportado
                    // (96dvh <= 96vh): está para que, si no lo estuviera, el sheet quede
                    // acotado a la pantalla en vez de crecer con el contenido y empujar
                    // el pie fijo fuera de la vista — justo lo que este modo vino a
                    // evitar. En 'hasta-completa' el max-h es el mecanismo, no el
                    // respaldo, y por eso no lleva `h` fija.
                    altura === 'completa'
                        ? 'h-[96dvh] max-h-[96vh]'
                        : altura === 'hasta-completa'
                          ? 'max-h-[90dvh]'
                          : 'max-h-[85vh]'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Capa para cerrar la ayuda tocando afuera: cubre todo el sheet (header +
                    contenido + pie), por debajo del popover (z-30) pero por encima de todo
                    lo demás. No compite con el cierre del sheet: ese backdrop vive AFUERA de
                    este `div` relative, y los clicks adentro ya paran acá con
                    `stopPropagation`. */}
                {ayudaAbierta && onHelp && (
                    <div data-testid="overlay-ayuda" className="absolute inset-0 z-20" onClick={onHelp} />
                )}
                {/* Header — fijo, no scrollea con el contenido. */}
                <div className="shrink-0 px-[18px] pt-3.5">
                    <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[#DBE0EB]" />
                    {/* `mb-4` en el contenedor, no en la fila del título: así la fila de
                        subtitle/acciones queda DENTRO del mismo bloque pero es su propio
                        renglón de ancho completo — no encajonado en la columna angosta del
                        título — y `acciones` puede empujarse hasta el borde derecho, a la
                        altura de minimizar/cerrar, en vez de quedar pegado al subtitle. */}
                    <div className="mb-4 flex flex-col gap-0.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                {eyebrow && (
                                    <span
                                        className={`text-[11px] font-extrabold uppercase tracking-wide ${eyebrowClassName ?? 'text-dsgreen'}`}
                                    >
                                        {eyebrow}
                                    </span>
                                )}
                                <h2 className="truncate text-[17px] font-extrabold leading-tight text-[#182645]">{title}</h2>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {/* `relative` acá (no en todo el header): el popover ancla
                                    justo debajo de ESTE botón, sin importar cuánto mida el
                                    resto del header (eyebrow/subtitle varían de sheet a
                                    sheet). */}
                                {onHelp && (
                                    <div className="relative">
                                        {/* Mismo círculo gris que Minimizar/Cerrar, pero con el
                                            signo "?" solo — no el ícono `CircleHelp`, que trae
                                            su propio círculo dibujado adentro del SVG: puesto
                                            sobre el círculo del botón quedaba un círculo dentro
                                            de otro círculo. */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Cómo funciona esta pantalla"
                                            aria-expanded={ayudaAbierta}
                                            onClick={onHelp}
                                            className="h-[30px] w-[30px] bg-[#F0F2F7] text-[15px] font-extrabold text-dsmuted hover:bg-[#e3e6ee]"
                                        >
                                            ?
                                        </Button>
                                        {/* Flota, no empuja: antes vivía en el flujo normal del
                                            contenido y cada apertura corría toda la lista de
                                            rubros hacia abajo. */}
                                        {ayudaAbierta && ayudaContenido && (
                                            <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-xl border border-dsline bg-white p-3 text-[12px] font-semibold leading-snug text-[#3B4761] shadow-[0_8px_24px_rgba(10,15,30,.16)]">
                                                {ayudaContenido}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {onMinimize && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Minimizar"
                                        onClick={onMinimize}
                                        className="h-[30px] w-[30px] bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                                    >
                                        <ChevronDown className="h-[15px] w-[15px]" strokeWidth={2.4} />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Cerrar"
                                    onClick={onClose}
                                    className="h-[30px] w-[30px] bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                                >
                                    <X className="h-[15px] w-[15px]" strokeWidth={2.4} />
                                </Button>
                            </div>
                        </div>
                        {/* Renglón propio, ancho completo: `acciones` se empuja con
                            `ml-auto` hasta el borde derecho (a la altura de cerrar/minimizar),
                            no hasta donde termina el subtitle. */}
                        {(subtitle || acciones) && (
                            <div className="flex items-center gap-2">
                                {subtitle && (
                                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold leading-tight text-dsmuted">
                                        {subtitle}
                                    </span>
                                )}
                                {acciones && <div className="ml-auto shrink-0">{acciones}</div>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Contenido — lo único que scrollea y lo único que cambia entre
                    vistas (ej. lista de propuesta vs. tabla "Ver versus"). */}
                <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-6">{children}</div>

                {/* Footer — fijo, fuera del scroll. Se mantiene visible al cambiar
                    de vista (ej. "Iniciar visita" sigue ahí en "Ver versus"). */}
                {/* `bg-[#FAFBFD]` (no solo el borde) para que el pie se lea como una zona
                 *  aparte del contenido scrolleable: el borde solo, casi del mismo blanco
                 *  que el fondo, dejaba la tabla y los controles fijos pegados en una sola
                 *  masa visual. */}
                {footer && (
                    <div className="shrink-0 border-t border-[#EEF0F5] bg-[#FAFBFD] px-[18px] pb-6 pt-3">{footer}</div>
                )}
            </div>
        </div>
    )
}
