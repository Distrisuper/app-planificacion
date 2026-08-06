import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { titleCaseNombre } from '@/lib/textFormat'
import type { AppExternaMontada } from '@/hooks/useAppExterna'

interface AppExternaSheetProps {
    montada: AppExternaMontada
    /** false = sigue montado (reapertura instantánea) pero no se ve ni recibe taps. */
    visible: boolean
    onClose: () => void
}

/**
 * Pantalla completa que embebe una app propia.
 *
 * NO reusa BottomSheet: ese primitivo topea en 85vh, tiene padding lateral y scroll interno,
 * y los tres arruinan un iframe (viewport recortado, franjas blancas, doble scroll). Sí reusa
 * su lenguaje visual de header.
 */
export default function AppExternaSheet({ montada, visible, onClose }: AppExternaSheetProps) {
    const { app, cliente, handoff } = montada
    const [cargando, setCargando] = useState(true)

    // La instancia se reusa entre aperturas, pero al cambiar de cliente el src cambia y
    // arranca una carga nueva: hay que volver a mostrar el overlay.
    useEffect(() => {
        setCargando(true)
    }, [handoff.url])

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
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-dsnavy">
                        {app.label}
                    </span>
                    <h2 className="truncate text-[17px] font-extrabold leading-tight text-[#182645]">
                        {nombre}
                    </h2>
                </div>
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

            <div className="relative min-h-0 flex-1">
                <iframe
                    // El name es el gancho de la variante de handoff 'form' (ver spec).
                    name={`app-externa-${app.id}`}
                    title={app.label}
                    src={handoff.url}
                    // Sin `sandbox`: la app ajena guarda su sesión en localStorage, que exige
                    // allow-same-origin; con eso más allow-scripts el sandbox no defiende de
                    // nada contra una app propia y sí agrega rotura silenciosa.
                    allow="clipboard-write"
                    onLoad={() => setCargando(false)}
                    className="h-full w-full border-0"
                />
                {cargando && (
                    <div
                        data-testid="app-externa-cargando"
                        className="absolute inset-0 grid place-items-center gap-2 bg-white"
                    >
                        <Loader2 className="h-6 w-6 animate-spin text-dsnavy" strokeWidth={2.4} />
                    </div>
                )}
            </div>
        </div>
    )
}
