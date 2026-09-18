import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useState, type ReactNode } from 'react'
import { Button } from './button'

interface ConfirmDialogProps {
    open: boolean
    /**
     * Se llama con `false` al cancelar o apretar Escape. NO al tocar afuera:
     * `AlertDialog` de Radix previene el cierre por interacción externa a propósito
     * (`onPointerDownOutside`/`onInteractOutside` con `preventDefault`), porque una
     * confirmación se responde, no se descarta sin querer.
     */
    onOpenChange: (open: boolean) => void
    title: string
    description: ReactNode
    /** Texto del botón que ejecuta la acción. Default: "Confirmar". */
    confirmLabel?: string
    cancelLabel?: string
    /** Pinta el botón de acción en rojo. Para acciones que descartan trabajo. */
    destructivo?: boolean
    /**
     * Sincrónico: el diálogo cierra al toque (comportamiento de `AlertDialog.Action`).
     * Si devuelve una promesa, el diálogo espera: cierra recién cuando resuelve, y si
     * rechaza queda ABIERTO para que el caller muestre el error en `description`. Sin esto
     * Radix cerraba antes de que la llamada volviera, y un fallo quedaba invisible (y como
     * promesa sin catch).
     */
    onConfirm: () => void | Promise<unknown>
}

/**
 * El diálogo de confirmación de la app — reemplaza a `window.confirm`, que además de
 * verse como un cartel del navegador ("localhost:5173 dice") bloquea el hilo y no se
 * puede estilar ni testear como parte del DOM.
 *
 * Va sobre `AlertDialog` de Radix y no sobre `BottomSheet` a propósito: un sheet que sube
 * desde abajo es el patrón mobile del vendedor, y esto se usa en la grilla de gerencia
 * (desktop). Además `AlertDialog` trae lo que una confirmación necesita y un div suelto
 * no: foco atrapado dentro del diálogo, foco inicial en "Cancelar" (la opción segura),
 * Escape, y `role="alertdialog"` con título y descripción anunciados.
 */
export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    destructivo,
    onConfirm,
}: ConfirmDialogProps) {
    const [trabajando, setTrabajando] = useState(false)

    function confirmar(e: React.MouseEvent) {
        const resultado = onConfirm()
        if (!(resultado instanceof Promise)) return
        // `AlertDialog.Action` cierra en su onClick salvo que el handler haga preventDefault.
        e.preventDefault()
        setTrabajando(true)
        resultado
            .then(() => onOpenChange(false))
            .catch(() => {
                /* el caller ya lo mostró en `description`; acá solo se evita el unhandled */
            })
            .finally(() => setTrabajando(false))
    }

    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                {/* OJO si este diálogo se usa dentro de algo arrastrable: Radix lo
                    portalea al body, pero React propaga los eventos por el árbol de
                    REACT, así que los clicks de estos botones llegan a los listeners del
                    ancestro que lo renderizó. Si ese ancestro es un draggable, el sensor
                    arranca un arrastre y se come el click — el diálogo parece muerto.
                    Acá NO se corta la propagación: hacerlo obliga a adivinar qué evento
                    escucha el sensor (`onMouseDown` no es `onPointerDown`) y encima
                    silencia los handlers de teclado a nivel window de la app. Lo que
                    corresponde es que el ancestro no mezcle su superficie de arrastre con
                    sus controles — ver la superficie aparte en `ClienteCardRuta`. */}
                <AlertDialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <AlertDialog.Title className="text-[16px] font-extrabold leading-tight text-dsnavytext">
                        {title}
                    </AlertDialog.Title>
                    {/* `asChild` + div: la descripción puede traer un formulario (CarteraDialog
                        mete un <select>), y un <div> adentro del <p> por defecto de Radix es
                        HTML inválido — React 19 lo loguea en cada render. */}
                    <AlertDialog.Description asChild>
                        <div className="mt-1.5 text-[13px] leading-snug text-dsmuted">{description}</div>
                    </AlertDialog.Description>
                    <div className="mt-5 flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={trabajando}
                                className="h-9 px-3.5 text-[13px]"
                            >
                                {cancelLabel}
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                size="sm"
                                onClick={confirmar}
                                disabled={trabajando}
                                className={`h-9 px-3.5 text-[13px] ${destructivo ? 'bg-dsred hover:bg-dsred/90' : ''}`}
                            >
                                {confirmLabel}
                            </Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    )
}
