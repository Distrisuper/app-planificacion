import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'

interface CambioDeSemanaDialogProps {
    open: boolean
    semanaAbierta: number
    clientesPendientes: string[]
    confirmando?: boolean
    onConfirmar: () => void
    onCancelar: () => void
}

/**
 * El cartel del 409 CAMBIO_DE_SEMANA: el vendedor tocó una acción en una semana distinta a la
 * que tiene abierta. Confirmar cierra la abierta (sin resolver a sus pendientes — quedan
 * pendientes de esa vuelta, no se pierden) y abre la que estaba mirando.
 */
export default function CambioDeSemanaDialog({
    open,
    semanaAbierta,
    clientesPendientes,
    confirmando,
    onConfirmar,
    onCancelar,
}: CambioDeSemanaDialogProps) {
    return (
        <BottomSheet open={open} onClose={onCancelar} title="Cambiar de semana" eyebrow="Atención">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                Tenés la <b>semana {semanaAbierta}</b> abierta
                {clientesPendientes.length > 0 && (
                    <>
                        {' '}
                        con <b>{clientesPendientes.length} clientes</b> pendientes
                    </>
                )}
                . Si seguís, esa semana queda como está (los pendientes no se pierden) y pasás a
                trabajar la que estabas mirando.
            </p>
            <div className="flex flex-col gap-2">
                <Button
                    onClick={onConfirmar}
                    loading={confirmando}
                    className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
                >
                    Cambiar de semana
                </Button>
                <button
                    type="button"
                    onClick={onCancelar}
                    className="h-11 w-full text-[13px] font-semibold text-dsmuted underline"
                >
                    Seguir en la semana que ya tenía abierta
                </button>
            </div>
        </BottomSheet>
    )
}
