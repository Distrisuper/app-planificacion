import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './button'

type Props = { children: ReactNode; onRecargar?: () => void }
type State = { falló: boolean }

/**
 * Red de seguridad de la raíz. Sin un boundary, cualquier error de render desmonta todo
 * el árbol y el vendedor queda mirando una pantalla gris sin ninguna salida — así se vio
 * el crash que provocaba Google Translate sobre la ficha del comercio (ver index.html).
 * No intenta recuperar estado: sólo nombra el problema y ofrece recargar.
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { falló: false }

    static getDerivedStateFromError(): State {
        return { falló: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack)
    }

    render() {
        if (!this.state.falló) return this.props.children
        const recargar = this.props.onRecargar ?? (() => window.location.reload())
        return (
            <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#F1F4F9] px-6 text-center">
                <h1 className="text-lg font-bold text-dsnavy">Algo falló</h1>
                <p className="max-w-xs text-sm text-dsmuted">
                    La pantalla no se pudo mostrar. Recargá la app para seguir.
                </p>
                <Button onClick={recargar}>Recargar</Button>
            </main>
        )
    }
}
