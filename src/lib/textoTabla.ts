/** Texto de tabla: normalización para buscar y comparación para ordenar (en español). */

/** Minúsculas y sin acentos, para buscar ("José" lo encuentra "jose"). */
export const normalizarTexto = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** true si cada palabra de `busqueda` aparece en `textoNormalizado` (ya pasado por
 *  `normalizarTexto`, una vez por fila y no en cada tecla). Búsqueda vacía → true. */
export function coincideTexto(busqueda: string, textoNormalizado: string): boolean {
    const palabras = normalizarTexto(busqueda).split(/\s+/).filter(Boolean)
    return palabras.every(p => textoNormalizado.includes(p))
}

const COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/** Orden alfabético en español: ignora acentos y mayúsculas ("álvarez" antes que "José"). */
export const compararTexto = (a: string, b: string): number => COLLATOR.compare(a, b)
