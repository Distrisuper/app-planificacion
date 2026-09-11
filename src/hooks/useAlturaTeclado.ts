import { useEffect, useState } from 'react'

/**
 * Alto (px) que el teclado virtual le está tapando a la pantalla ahora mismo. `0` si no
 * hay teclado, en desktop, o en Android con `interactive-widget=resizes-content` (ver
 * `index.html`) — ahí el propio layout viewport ya se achica con el teclado, así que
 * `innerHeight` y `visualViewport.height` coinciden y este cálculo da `0` solo.
 *
 * Mecanismo estándar (VisualViewport API, MDN) para reposicionar un `position: fixed`
 * por encima del teclado en iOS Safari, que NO soporta `interactive-widget` (WebKit
 * bug #259770, sin resolver): ahí el layout viewport nunca se achica, así que un pie
 * fijo anclado a `bottom: 0` queda tapado por el teclado sin este cálculo — Safari en
 * cambio "panea" el visual viewport hacia arriba (sube `offsetTop`).
 *
 * `activo` es el gate del sheet abierto (no de si hay teclado): sin él, cada
 * `BottomSheet` de la app quedaría escuchando `resize`/`scroll` de por vida, aunque
 * esté cerrado.
 */
export function useAlturaTeclado(activo: boolean): number {
    const [altura, setAltura] = useState(0)

    useEffect(() => {
        const vv = window.visualViewport
        if (!activo || !vv) {
            setAltura(0)
            return
        }

        function actualizar() {
            // Lo que separa el borde de abajo del visual viewport (lo que se ve) del
            // borde de abajo del layout viewport (`innerHeight`, que NO se achica por
            // el teclado en iOS) es justo lo que el teclado está tapando.
            const solapado = window.innerHeight - vv!.height - vv!.offsetTop
            setAltura(Math.max(0, Math.round(solapado)))
        }

        actualizar()
        vv.addEventListener('resize', actualizar)
        vv.addEventListener('scroll', actualizar)
        return () => {
            vv.removeEventListener('resize', actualizar)
            vv.removeEventListener('scroll', actualizar)
        }
    }, [activo])

    return altura
}
