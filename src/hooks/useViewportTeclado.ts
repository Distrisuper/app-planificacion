import { useEffect, useRef, useState } from 'react'

export interface ViewportTeclado {
    /** Alto (px) que el teclado virtual le tapa a la pantalla POR ABAJO. */
    tapado: number
    /** Alto (px) que quedó fuera de pantalla POR ARRIBA, porque iOS "paneó" el visual
     *  viewport hacia abajo para traer el input enfocado a la vista. */
    desplazado: number
}

const QUIETO: ViewportTeclado = { tapado: 0, desplazado: 0 }

/**
 * Los dos bordes que separan el *layout viewport* (contra el que se posiciona todo
 * `position: fixed`) de la franja que el usuario realmente ve. Ambos `0` si no hay
 * teclado, en desktop, o en Android con `interactive-widget=resizes-content` (ver
 * `index.html`) — ahí el propio layout viewport ya se achica con el teclado, así que
 * `innerHeight` y `visualViewport.height` coinciden y este cálculo da `0` solo.
 *
 * Mecanismo estándar (VisualViewport API, MDN) para reposicionar un `position: fixed`
 * por encima del teclado en iOS Safari, que NO soporta `interactive-widget` (WebKit
 * bug #259770, sin resolver): ahí el layout viewport nunca se achica, así que un pie
 * fijo anclado a `bottom: 0` queda tapado por el teclado sin este cálculo — Safari en
 * cambio "panea" el visual viewport hacia arriba (sube `offsetTop`).
 *
 * `tapado` y `desplazado` van SEPARADOS y no sumados en un solo número: quien consume
 * esto necesita recortar la caja por los dos lados. Compensar sólo abajo deja la caja
 * más alta que la franja visible, y lo que sobra se va por arriba de la pantalla — que
 * es exactamente el bug que se llevó puesto el header del buscador en iOS.
 *
 * `activo` es el gate del sheet abierto (no de si hay teclado): sin él, cada
 * `BottomSheet` de la app quedaría escuchando `resize`/`scroll` de por vida, aunque
 * esté cerrado.
 */
export function useViewportTeclado(activo: boolean): ViewportTeclado {
    const [medida, setMedida] = useState<ViewportTeclado>(QUIETO)
    // iOS dispara `resize`/`scroll` en ráfaga mientras el teclado anima, y casi todos
    // traen los mismos números: sin comparar contenido, cada uno re-renderiza el sheet
    // entero (el objeto es nuevo cada vez).
    const ultima = useRef<ViewportTeclado>(QUIETO)

    useEffect(() => {
        const vv = window.visualViewport
        if (!activo || !vv) {
            ultima.current = QUIETO
            setMedida(QUIETO)
            return
        }

        function actualizar() {
            const desplazado = Math.max(0, Math.round(vv!.offsetTop))
            // Lo que separa el borde de abajo del visual viewport (lo que se ve) del
            // borde de abajo del layout viewport (`innerHeight`, que NO se achica por
            // el teclado en iOS) es justo lo que el teclado está tapando.
            const tapado = Math.max(0, Math.round(window.innerHeight - vv!.height - vv!.offsetTop))
            if (tapado === ultima.current.tapado && desplazado === ultima.current.desplazado) return
            ultima.current = { tapado, desplazado }
            setMedida(ultima.current)
        }

        actualizar()
        vv.addEventListener('resize', actualizar)
        vv.addEventListener('scroll', actualizar)
        return () => {
            vv.removeEventListener('resize', actualizar)
            vv.removeEventListener('scroll', actualizar)
        }
    }, [activo])

    return medida
}
