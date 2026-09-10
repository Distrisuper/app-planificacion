import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { ReactNode } from 'react'
import { Button } from './button'

interface ConfirmDialogProps {
    open: boolean
    /** Se llama con `false` al cancelar, tocar afuera o apretar Escape. */
    onOpenChange: (open: boolean) => void
    title: string
    description: ReactNode
    /** Texto del botón que ejecuta la acción. Default: "Confirmar". */
    confirmLabel?: string
    cancelLabel?: string
    /** Pinta el botón de acción en rojo. Para acciones que descartan trabajo. */
    destructivo?: boolean
    onConfirm: () => void
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
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <AlertDialog.Content
                    // Radix portalea esto al body, pero React propaga los eventos por el
                    // árbol de REACT, no por el del DOM: si el diálogo se renderiza como
                    // hijo de un elemento arrastrable (la card de la grilla de gerencia),
                    // el pointerdown de estos botones burbujea hasta los listeners de
                    // dnd-kit y arranca un drag que se queda con el puntero — el `click`
                    // nunca se dispara y el diálogo queda muerto. Se corta acá y no en
                    // cada consumidor porque es la clase de bug que no se ve venir.
                    // Radix no se entera: su cierre por Escape y por click afuera va por
                    // listeners nativos en el document, no por el burbujeo de React.
                    onPointerDown={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                    className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]"
                >
                    <AlertDialog.Title className="text-[16px] font-extrabold leading-tight text-dsnavytext">
                        {title}
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-1.5 text-[13px] leading-snug text-dsmuted">
                        {description}
                    </AlertDialog.Description>
                    <div className="mt-5 flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                            <Button variant="outline" size="sm" className="h-9 px-3.5 text-[13px]">
                                {cancelLabel}
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                size="sm"
                                onClick={onConfirm}
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
