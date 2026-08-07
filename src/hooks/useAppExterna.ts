import { useCallback, useEffect, useRef, useState } from 'react'
import { resolverHandoff, type AppExterna, type HandoffResuelto } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

export interface AppExternaMontada {
    app: AppExterna
    cliente: IVisitClientCard
    handoff: HandoffResuelto
}

interface EstadoApps {
    clienteActivo: IVisitClientCard | null
    montadas: Record<string, AppExternaMontada>
}

const ESTADO_VACIO: EstadoApps = { clienteActivo: null, montadas: {} }

// Duración elegida por ser el promedio de una visita completa: un salto rápido a WhatsApp o
// a atender un llamado (muy frecuente en el trabajo de campo) no debe recargar el iframe
// activo. Solo un segundo plano más largo que una visita entera —la jornada terminó, el
// teléfono quedó guardado durante un trayecto— libera la memoria.
const TIMEOUT_FONDO_MS = 60 * 60 * 1000

/**
 * Ciclo de vida de las apps externas embebidas para el cliente activo.
 *
 * Sostiene un `montadas` por `app.id`, no una sola instancia: el vendedor puede tener
 * Pagos y Versus del mismo cliente vivos a la vez y cambiar entre ellos sin recargar
 * (ver AppExternaSheet, que los muestra como tabs). Cambiar de cliente descarta TODAS las
 * instancias vivas de una — no tiene sentido sostener los pagos de un cliente que ya no es
 * el que se está mirando.
 *
 * `montada`/`visible` se separan igual que antes: cerrar la pantalla OCULTA todo pero no lo
 * desmonta, así reabrir el mismo cliente es instantáneo. `desmontar` es lo que suelta la
 * memoria — mantener hasta 3 apps React ajenas vivas por cliente no es gratis en un Android
 * de gama baja, así que se libera al cambiar de día/semana.
 */
export function useAppExterna() {
    const [estado, setEstado] = useState<EstadoApps>(ESTADO_VACIO)
    const [appActivaId, setAppActivaId] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)

    const abrir = useCallback((app: AppExterna, cliente: IVisitClientCard) => {
        setEstado(previo => {
            const mismoCliente =
                previo.clienteActivo?.codigoParticularCliente === cliente.codigoParticularCliente
            if (mismoCliente && previo.montadas[app.id]) return previo // ya vive: no se re-resuelve el handoff
            const montada: AppExternaMontada = { app, cliente, handoff: resolverHandoff(app, cliente) }
            return {
                clienteActivo: cliente,
                montadas: mismoCliente ? { ...previo.montadas, [app.id]: montada } : { [app.id]: montada },
            }
        })
        setAppActivaId(app.id)
        setVisible(true)
    }, [])

    const ocultar = useCallback(() => setVisible(false), [])

    const desmontar = useCallback(() => {
        setVisible(false)
        setEstado(ESTADO_VACIO)
        setAppActivaId(null)
    }, [])

    // `montadas` se lee al momento en que dispara el evento, no en las deps del efecto: así
    // el listener se suscribe una sola vez por instancia del hook, sin importar si había algo
    // montado cuando se montó el componente.
    const montadasRef = useRef(estado.montadas)
    montadasRef.current = estado.montadas

    useEffect(() => {
        let timeoutId: number | undefined
        function onVisibilityChange() {
            if (document.hidden) {
                if (Object.keys(montadasRef.current).length === 0) return
                timeoutId = window.setTimeout(desmontar, TIMEOUT_FONDO_MS)
            } else if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId)
                timeoutId = undefined
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        }
    }, [desmontar])

    return {
        clienteActivo: estado.clienteActivo,
        montadas: estado.montadas,
        appActivaId,
        visible,
        abrir,
        ocultar,
        desmontar,
    }
}
