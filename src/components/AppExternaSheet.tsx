import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { titleCaseNombre } from '@/lib/textFormat'
import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { AppExternaMontada } from '@/hooks/useAppExterna'
import type { IVisitClientCard } from '@/types/planificacion'

interface AppExternaSheetProps {
    cliente: IVisitClientCard
    /** Todas las apps vivas para `cliente`, keyed por `app.id`. Se renderiza un frame por
     *  entrada; solo el de `appActivaId` se ve. */
    montadas: Record<string, AppExternaMontada>
    appActivaId: string | null
    /** false = el sheet entero sigue montado (reapertura instantánea) pero no se ve ni
     *  recibe taps. Independiente de qué frame esté activo. */
    visible: boolean
    onSeleccionarApp: (app: AppExterna) => void
    onClose: () => void
}

// Si a los 15s no llegó `onLoad`, algo se colgó (red mala en el punto de venta, app ajena
// caída). No es el caso de un frame bloqueado por X-Frame-Options/CSP: ese termina de
// "cargar" (a una página vacía) sin disparar `onError`, así que también entra por acá.
const TIMEOUT_CARGA_MS = 15000

// Abajo, no arriba: es la zona que el pulgar alcanza cómodo sosteniendo el teléfono con
// una mano, y es donde el vendedor va a estar tocando repetidamente para saltar entre
// Pagos/Versus/CRM del mismo cliente.
const TAB_ACTIVA = 'flex flex-1 flex-col items-center gap-1 rounded-xl bg-dsnavy/10 py-2 text-dsnavy'
const TAB_INACTIVA = 'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-dsmuted'

interface AppExternaFrameProps {
    montada: AppExternaMontada
    activa: boolean
    /** Se incrementa desde el header (botón Recargar) para forzar una recarga de ESTE
     *  frame en particular, sin importar si es el activo o no cuando se emitió el click
     *  (siempre lo es: el botón solo actúa sobre appActivaId). */
    recargarSignal: number
}

/** Una app externa embebida, dueña de su propio ciclo de carga. Vive keyed por
 *  `app.id:cliente.codigoParticularCliente` en AppExternaSheet, así que cambiar de cliente
 *  la remonta de cero (nunca navega un iframe vivo a otro cliente) y cambiar de tab solo la
 *  oculta. */
function AppExternaFrame({ montada, activa, recargarSignal }: AppExternaFrameProps) {
    const { app, handoff } = montada
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState(false)
    // Cambia el src en cada reintento: mismo origen y query, pero una URL distinta para que
    // el navegador la trate como un pedido nuevo y no le sirva una respuesta cacheada.
    const [intento, setIntento] = useState(0)

    const recargar = useCallback(() => {
        setCargando(true)
        setError(false)
        setIntento(n => n + 1)
    }, [])

    const señalPrevia = useRef(recargarSignal)
    useEffect(() => {
        if (recargarSignal !== señalPrevia.current) {
            señalPrevia.current = recargarSignal
            recargar()
        }
    }, [recargarSignal, recargar])

    useEffect(() => {
        if (!cargando) return
        const timeoutId = window.setTimeout(() => {
            setCargando(false)
            setError(true)
        }, TIMEOUT_CARGA_MS)
        return () => window.clearTimeout(timeoutId)
    }, [cargando])

    const src =
        intento === 0
            ? handoff.url
            : `${handoff.url}${handoff.url.includes('?') ? '&' : '?'}_reintento=${intento}`

    const iframeRef = useRef<HTMLIFrameElement>(null)

    // React no engancha `onError` en <iframe>: a diferencia de <img>, no está en su lista de
    // eventos no delegados (solo registra 'load'). Sin este listener nativo el prop onError
    // del JSX sería letra muerta y una falla de red nunca se vería.
    useEffect(() => {
        const node = iframeRef.current
        if (!node) return
        const onError = () => {
            setCargando(false)
            setError(true)
        }
        node.addEventListener('error', onError)
        return () => node.removeEventListener('error', onError)
    }, [])

    return (
        <div className={`absolute inset-0 ${activa ? '' : 'invisible pointer-events-none'}`}>
            <iframe
                ref={iframeRef}
                // El name es el gancho de la variante de handoff 'form' (ver spec).
                name={`app-externa-${app.id}`}
                title={app.label}
                src={src}
                // Sin `sandbox`: la app ajena guarda su sesión en localStorage, que exige
                // allow-same-origin; con eso más allow-scripts el sandbox no defiende de
                // nada contra una app propia y sí agrega rotura silenciosa.
                allow="clipboard-write"
                onLoad={() => setCargando(false)}
                className="h-full w-full border-0"
            />
            {cargando && !error && (
                <div
                    data-testid="app-externa-cargando"
                    className="absolute inset-0 grid place-items-center gap-2 bg-white"
                >
                    <Loader2 className="h-6 w-6 animate-spin text-dsnavy" strokeWidth={2.4} />
                </div>
            )}
            {error && (
                <div
                    data-testid="app-externa-error"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center"
                >
                    <p className="text-[14px] font-semibold text-[#182645]">
                        No se pudo cargar {app.label}.
                    </p>
                    <p className="text-[13px] text-dsmuted">
                        Revisá tu conexión y volvé a intentar.
                    </p>
                    <Button onClick={recargar} className="mt-1">
                        <RotateCw className="mr-2 h-4 w-4" strokeWidth={2.4} />
                        Reintentar
                    </Button>
                </div>
            )}
        </div>
    )
}

/**
 * Pantalla completa que embebe hasta una app por cliente vivas simultáneamente, con una
 * botonera de tabs abajo (alcance del pulgar) para cambiar entre ellas sin cerrar ni recargar.
 *
 * NO reusa BottomSheet: ese primitivo topea en 85vh, tiene padding lateral y scroll interno,
 * y los tres arruinan un iframe (viewport recortado, franjas blancas, doble scroll). Sí reusa
 * su lenguaje visual de header.
 */
export default function AppExternaSheet({
    cliente,
    montadas,
    appActivaId,
    visible,
    onSeleccionarApp,
    onClose,
}: AppExternaSheetProps) {
    const [recargas, setRecargas] = useState<Record<string, number>>({})

    const recargar = useCallback(() => {
        if (!appActivaId) return
        setRecargas(previas => ({ ...previas, [appActivaId]: (previas[appActivaId] ?? 0) + 1 }))
    }, [appActivaId])

    const nombre = titleCaseNombre(cliente.nombreFantasia || cliente.nombreCliente)

    return (
        <div
            data-testid="app-externa-contenedor"
            // `dvh` y no `vh`: con `vh` la barra de URL de mobile tapa el fondo del iframe.
            // overflow-hidden: el único scroll es el de la app embebida.
            className={`fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white ${
                visible ? '' : 'invisible pointer-events-none'
            }`}
            style={{ height: '100dvh' }}
        >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEF0F5] px-[18px] py-3">
                <h2 className="truncate text-[17px] font-extrabold leading-tight text-[#182645]">
                    {nombre}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Recargar"
                        onClick={recargar}
                        className="h-[30px] w-[30px] shrink-0 bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                    >
                        <RotateCw className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cerrar"
                        onClick={onClose}
                        className="h-[30px] w-[30px] shrink-0 bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                    >
                        <X className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    </Button>
                </div>
            </div>

            <div className="relative min-h-0 flex-1">
                {Object.values(montadas).map(montada => (
                    <AppExternaFrame
                        key={`${montada.app.id}:${montada.cliente.codigoParticularCliente}`}
                        montada={montada}
                        activa={montada.app.id === appActivaId}
                        recargarSignal={recargas[montada.app.id] ?? 0}
                    />
                ))}
            </div>

            {/* El botón "Volver" ocupa el mismo lugar que "Cerrar visita" en VisitaSheet: es
                el punto de salida que el pulgar espera encontrar ahí, no solo la X chica del
                header. `px-[18px]` y `1.5rem` de piso son el mismo margen horizontal y el
                mismo padding inferior que el footer de BottomSheet (`px-[18px] pb-6`) — sin
                igualarlos, el botón queda con un ancho y un aire distintos entre esta
                pantalla y VisitaSheet, y la transición entre las dos se siente como un salto.
                `env(safe-area-inset-bottom)` solo agranda el piso en dispositivos con barra
                gestual que lo pida (mismo patrón que Notification.tsx usa arriba). */}
            <div
                className="flex shrink-0 flex-col gap-2 border-t border-[#EEF0F5] bg-white px-[18px] pt-1.5"
                style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
                <div className="flex gap-1">
                    {APPS_EXTERNAS.map(app => {
                        const Icono = app.icon
                        const activa = app.id === appActivaId
                        return (
                            <button
                                key={app.id}
                                type="button"
                                onClick={() => onSeleccionarApp(app)}
                                className={activa ? TAB_ACTIVA : TAB_INACTIVA}
                            >
                                <Icono className="h-5 w-5" strokeWidth={activa ? 2.4 : 2} />
                                <span className="text-[10.5px] font-extrabold uppercase tracking-wide">
                                    {app.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
                <Button onClick={onClose} className="h-12 w-full text-[15px]">
                    Volver
                </Button>
            </div>
        </div>
    )
}
