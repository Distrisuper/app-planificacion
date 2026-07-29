import { AlertTriangle, Check, Info } from 'lucide-react'

export type NotificacionTipo = 'exito' | 'error' | 'info'

export interface Notificacion {
    tipo: NotificacionTipo
    mensaje: string
}

interface NotificationProps {
    notificacion: Notificacion | null
    onDismiss: () => void
}

const POR_TIPO: Record<NotificacionTipo, { label: string; bg: string; Icon: typeof Check }> = {
    exito: { label: 'Listo', bg: 'bg-dsgreen', Icon: Check },
    error: { label: 'Error', bg: 'bg-dsred', Icon: AlertTriangle },
    info: { label: 'Aviso', bg: 'bg-dsnavy', Icon: Info },
}

/** Burbuja de notificación arriba al centro, estilo notificación nativa de Android. Único
 *  mecanismo de aviso de la app — reemplaza al toast de abajo. */
export function Notification({ notificacion, onDismiss }: NotificationProps) {
    if (!notificacion) return null
    const { label, bg, Icon } = POR_TIPO[notificacion.tipo]

    return (
        <button
            onClick={onDismiss}
            aria-label={`${label}: ${notificacion.mensaje}`}
            className="animate-notif-in fixed left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 text-left shadow-[0_10px_28px_rgba(10,15,30,.22)]"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
            <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${bg}`}
            >
                <Icon className="h-4 w-4" strokeWidth={2.6} />
            </span>
            <span className="min-w-0">
                <span className="block text-[12.5px] font-extrabold leading-tight text-[#182645]">
                    {label}
                </span>
                <span className="block truncate text-[12.5px] leading-tight text-dsmuted">
                    {notificacion.mensaje}
                </span>
            </span>
        </button>
    )
}
