import * as Dialog from '@radix-ui/react-dialog'

interface AlcanceCambioDialogProps {
    open: boolean
    /** El cambio que se está por aplicar, en palabras ("Mover a Kiosco Uno al JUE · Semana 2"). */
    accion: string
    /** true = también en la ruta base (desde la próxima vuelta). */
    onElegir: (aplicarARutaBase: boolean) => void
    /** Cancelar, Escape o tocar afuera: no se aplica nada. */
    onCancelar: () => void
}

/**
 * Pregunta hasta dónde llega un reacomodo hecho en la vuelta actual: solo esta vuelta, o
 * también la ruta base (que es lo que se copia al armar la próxima).
 *
 * Tres salidas y no un `ConfirmDialog`: ese tiene una sola acción. Va sobre `Dialog` de
 * Radix como `AgregarClienteExtraDialog`, y se monta en `RutaPage`, nunca dentro del
 * grid: dentro de una superficie arrastrable los clicks de los botones llegarían al
 * sensor de dnd-kit (ver la nota en `ConfirmDialog`).
 */
export default function AlcanceCambioDialog({
    open,
    accion,
    onElegir,
    onCancelar,
}: AlcanceCambioDialogProps) {
    return (
        <Dialog.Root open={open} onOpenChange={abierto => !abierto && onCancelar()}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-[60] bg-black/45" />
                <Dialog.Content className="animate-dialogo-in fixed left-1/2 top-1/2 z-[60] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-[0_18px_44px_rgba(10,15,30,.28)]">
                    <Dialog.Title className="text-[16px] font-extrabold leading-tight text-slate-900">
                        ¿Dónde aplicar el cambio?
                    </Dialog.Title>
                    <Dialog.Description className="mt-1.5 text-[13px] leading-snug text-slate-500">
                        {accion}. La ruta base es la que se copia al armar cada vuelta: si
                        también la cambiás, aplica desde la próxima.
                    </Dialog.Description>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                            onClick={onCancelar}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            // Primario: es lo que pasaba siempre (el cambio queda en la vuelta), y la
                            // ruta base se toca solo si se elige a propósito.
                            className="h-9 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white"
                            onClick={() => onElegir(false)}
                        >
                            Solo esta vuelta
                        </button>
                        <button
                            type="button"
                            className="h-9 rounded-lg border-[1.5px] border-slate-200 px-3.5 text-[13px] font-semibold text-slate-700"
                            onClick={() => onElegir(true)}
                        >
                            Esta vuelta y la ruta base
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
