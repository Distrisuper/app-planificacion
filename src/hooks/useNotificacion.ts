import { useCallback, useEffect, useRef, useState } from 'react'
import type { Notificacion, NotificacionTipo } from '@/components/ui/Notification'

const DURACION_MS = 5000

export function useNotificacion() {
    const [notificacion, setNotificacion] = useState<Notificacion | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const ocultar = useCallback(() => {
        clearTimeout(timeoutRef.current)
        setNotificacion(null)
    }, [])

    // Una nueva notificación reemplaza a la que esté mostrándose y resetea el timer — no hay
    // cola/apilado.
    const mostrar = useCallback((tipo: NotificacionTipo, mensaje: string) => {
        clearTimeout(timeoutRef.current)
        setNotificacion({ tipo, mensaje })
        timeoutRef.current = setTimeout(() => setNotificacion(null), DURACION_MS)
    }, [])

    useEffect(() => () => clearTimeout(timeoutRef.current), [])

    return { notificacion, mostrar, ocultar }
}
