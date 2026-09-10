import { useEffect, useState } from 'react'

/** 300ms: el mismo valor que venía inline en `useBuscador`. */
const DEBOUNCE_MS = 300

/**
 * El texto de un input, atrasado hasta que el usuario deja de tipear.
 *
 * Existe porque los dos buscadores de cartera (el del vendedor y el de gerencia) piden
 * lo mismo: el endpoint resuelve el estado cliente por cliente, una query cada uno, así
 * que una request por tecla sobre una cartera entera es cara de verdad.
 */
export function useTextoDebounced(texto: string, ms: number = DEBOUNCE_MS): string {
    const [debounced, setDebounced] = useState(texto)
    useEffect(() => {
        const id = setTimeout(() => setDebounced(texto), ms)
        return () => clearTimeout(id)
    }, [texto, ms])
    return debounced
}
