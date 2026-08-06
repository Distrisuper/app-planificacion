import { useCallback, useState } from 'react'
import { resolverHandoff, type AppExterna, type HandoffResuelto } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

export interface AppExternaMontada {
    app: AppExterna
    cliente: IVisitClientCard
    handoff: HandoffResuelto
}

/**
 * Ciclo de vida de la app externa embebida.
 *
 * Separa `montada` de `visible` a propósito: cerrar la pantalla OCULTA el iframe pero no lo
 * desmonta, así la próxima apertura del mismo cliente es instantánea en vez de recargar el
 * bundle entero de la app ajena. `desmontar` es lo que suelta la memoria — mantener una app
 * React ajena viva por cliente no es gratis en un Android de gama baja.
 */
export function useAppExterna() {
    const [montada, setMontada] = useState<AppExternaMontada | null>(null)
    const [visible, setVisible] = useState(false)

    const abrir = useCallback((app: AppExterna, cliente: IVisitClientCard) => {
        setMontada(previa =>
            previa &&
            previa.app.id === app.id &&
            previa.cliente.codigoParticularCliente === cliente.codigoParticularCliente
                ? previa // misma app + mismo cliente: se reusa la instancia viva
                : { app, cliente, handoff: resolverHandoff(app, cliente) },
        )
        setVisible(true)
    }, [])

    const ocultar = useCallback(() => setVisible(false), [])

    const desmontar = useCallback(() => {
        setVisible(false)
        setMontada(null)
    }, [])

    return { montada, visible, abrir, ocultar, desmontar }
}
